"""
CrewAI Product Planner — EdgeOne Pages handler (Python).

Flow: plan → collaborate (PM + Tech Lead) → review (VP)
Uses stream=True + kickoff_async() for native async SSE streaming.
"""

from pydantic import BaseModel
from crewai.flow import Flow, listen, start
from crewai.types.streaming import StreamChunkType

from ._llm_singleton import init_llm, get_llm
from ._crews.product_crew.product_crew import ProductCrew
from ._crews.review_crew.review_crew import ReviewCrew
from ._logger import create_logger

logger = create_logger("stream")


# ─── Flow State ───

class ProductPlanState(BaseModel):
    product_name: str = ""
    product_brief: str = ""
    collaboration_result: str = ""
    review_result: str = ""
    locale: str = "English"


# ─── Flow Definition ───

class ProductPlanFlow(Flow[ProductPlanState]):
    """
    Product planning Flow:
    1. plan()        — Expand product name into a structured brief (direct LLM call)
    2. collaborate() — Crew1: PM writes PRD → Tech Lead evaluates
    3. review()      — Crew2: VP gives final Go/No-Go decision
    """

    stream = True  # Enable streaming output

    @start()
    def plan(self):
        """Expand product name into a brief description for context."""
        logger.log(f"plan: {self.state.product_name}")
        llm = get_llm()
        self.state.product_brief = llm.call(
            f"Based on the product name '{self.state.product_name}', "
            f"write a brief product description in 2-3 sentences covering: "
            f"what the product does, who it's for, and its core value proposition. "
            f"Output the description only, no titles or prefixes. "
            f"You MUST respond in {self.state.locale}."
        )
        logger.log(f"product_brief: {self.state.product_brief[:100]}...")

    @listen(plan)
    def collaborate(self):
        """Crew1: PM + Tech Lead collaborate on the product."""
        logger.log("collaborate start")
        result = (
            ProductCrew()
            .crew()
            .kickoff(inputs={
                "product_name": self.state.product_name,
                "product_brief": self.state.product_brief,
                "locale": self.state.locale,
            })
        )
        self.state.collaboration_result = result.raw
        logger.log("collaborate done")

    @listen(collaborate)
    def review(self):
        """Crew2: VP reviews the team's work."""
        logger.log("review start")
        result = (
            ReviewCrew()
            .crew()
            .kickoff(inputs={
                "product_name": self.state.product_name,
                "collaboration_result": self.state.collaboration_result,
                "locale": self.state.locale,
            })
        )
        self.state.review_result = result.raw
        logger.log("review done")


# ─── EdgeOne Pages Handler ───

async def handler(context):
    """POST /stream — Start the product planning Flow and return SSE stream."""
    logger.log("conversationId:", getattr(context, "conversation_id", None),
               "runId:", getattr(context, "run_id", None))

    body = context.request.body or {}
    product_name = body.get("product_name")
    locale = body.get("locale", "English")
    logger.log("product_name:", product_name, "locale:", locale)

    if not product_name:
        logger.error("Missing product_name")
        return {"status_code": 400, "body": "Missing product_name"}

    # Initialize LLM singleton (first request reads from context.env)
    try:
        init_llm(context.env)
    except Exception as e:
        msg = str(e)
        logger.error(msg)
        return {"status_code": 500, "body": {"error": msg}}

    async def gen():
        streaming = None
        try:
            flow = ProductPlanFlow()
            flow.state.product_name = product_name
            flow.state.locale = locale

            yield context.utils.sse({
                "type": "flow_start",
                "product_name": product_name,
            })

            # Use kickoff_async() for native async streaming
            streaming = await flow.kickoff_async()
            prev_agent = ""

            async for chunk in streaming:
                agent_role = (chunk.agent_role or "").strip()

                # Detect agent switch
                if agent_role and agent_role != prev_agent:
                    if prev_agent:
                        yield context.utils.sse({"type": "agent_end", "agent": prev_agent})
                    yield context.utils.sse({
                        "type": "agent_start",
                        "agent": agent_role,
                        "task": chunk.task_name,
                    })
                    prev_agent = agent_role

                # Handle different chunk types
                if chunk.chunk_type == StreamChunkType.TEXT:
                    yield context.utils.sse({
                        "type": "chunk",
                        "agent": agent_role,
                        "task_name": chunk.task_name,
                        "task_index": chunk.task_index,
                        "content": chunk.content,
                    })
                elif chunk.chunk_type == StreamChunkType.TOOL_CALL and chunk.tool_call:
                    yield context.utils.sse({
                        "type": "tool_call",
                        "agent": agent_role,
                        "tool_name": chunk.tool_call.tool_name,
                        "arguments": chunk.tool_call.arguments,
                    })

            # Send final agent_end
            if prev_agent:
                yield context.utils.sse({"type": "agent_end", "agent": prev_agent})

            yield context.utils.sse({"type": "done", "status": "completed"})

        except Exception as e:
            logger.error("stream error:", str(e))
            yield context.utils.sse({"type": "error", "message": str(e)})
            yield context.utils.sse({"type": "done", "status": "error"})
        finally:
            if streaming and not streaming.is_completed:
                try:
                    await streaming.aclose()
                except Exception:
                    pass

    return context.utils.stream_sse(gen())
