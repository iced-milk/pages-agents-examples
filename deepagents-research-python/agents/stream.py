"""
Deep Research Agent — EdgeOne Pages handler (Python).

Lead Researcher + Expert Researcher architecture:
- Lead Researcher breaks user questions into sub-questions
- Delegates each to an Expert Researcher (subagent with internet_search tool)
- Synthesizes a concise answer from all sub-results

Stream design follows the official Deep Agents streaming guide
  https://docs.langchain.com/oss/python/deepagents/streaming

We use ``stream_mode=["updates", "messages"]`` with ``subgraphs=True`` and the
``v2`` streaming format. Every chunk is a unified ``StreamPart`` dict with
``type`` / ``ns`` / ``data`` keys.

- "updates"  → authoritative source for lifecycle / tool events.
    The aggregated AIMessage in the model node (named ``model`` in the
    deployed langchain version, ``model_request`` in newer docs) already
    contains complete ``tool_calls`` (real id, name, parsed args) and
    ToolMessages in the ``tools`` node carry the inner ``tool_call_id``.
    This is far more reliable than reassembling from per-chunk
    ``tool_call_chunks`` in the messages stream.

- "messages" → only used for streaming assistant *text* tokens.

Emitted SSE events (intentionally minimal):
  ┌─────────────────────┬─────────────────────────────────────────┐
  │ subagent_pending    │ main agent issued a `task` tool call    │
  │ subagent_step       │ subagent entered a node                 │
  │ tool_call           │ subagent invoked a tool (name + args)   │
  │ tool                │ subagent's tool finished (no body)      │
  │ subagent_complete   │ task ToolMessage returned to main agent │
  │ ai                  │ assistant text token                    │
  │ error               │ stream error                            │
  └─────────────────────┴─────────────────────────────────────────┘
"""

import asyncio
import json
import re
from datetime import datetime, timezone

from langchain.chat_models import init_chat_model
from langchain.agents.middleware import (
    ModelCallLimitMiddleware,
    ModelRetryMiddleware,
    ToolCallLimitMiddleware,
    ToolRetryMiddleware,
)
from langchain_core.messages import AIMessageChunk, ToolMessage
from langchain_community.tools import DuckDuckGoSearchResults
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend

from ._logger import create_logger

logger = create_logger("research-stream")

# ─── Singleton model & agent (lazy init) ───

_model = None
_agent = None


def _get_env(context_env) -> dict[str, str]:
    source = context_env or {}
    required = ("AI_GATEWAY_API_KEY", "AI_GATEWAY_BASE_URL")
    missing = [k for k in required if not (source.get(k) or "").strip()]

    if missing:
        raise RuntimeError(f"Missing environment variables: {', '.join(missing)}")

    return {k: source[k] for k in required}


def _get_model(env: dict[str, str]):
    global _model
    if _model is None:
        logger.log("Initializing model...")
        _model = init_chat_model(
            model="@Pages/hy3-preview",
            model_provider="openai",
            api_key=env["AI_GATEWAY_API_KEY"],
            base_url=env["AI_GATEWAY_BASE_URL"],
            temperature=0,
            timeout=300,
            default_headers={
                "X-Gateway-Quota-Bypass": "true",
            },
        )
    else:
        logger.log("Model already initialized, reusing")
    return _model


def _get_agent(model, checkpointer, store):
    global _agent
    if _agent is None:
        logger.log("Initializing research agent...")

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

        # -- Tools --
        internet_search = DuckDuckGoSearchResults(
            name="internet_search",
            max_results=3,
            output_format="list",
        )

        # -- SubAgent definition --
        researcher_subagent = {
            "name": "researcher",
            "description": "An expert researcher that answers a specific sub-question using web search.",
            "system_prompt": (
                "You are an expert researcher. "
                f"Today's date is {today}. "
                "Use `internet_search` to find relevant, up-to-date information. "
                "Return only a concise summary of your findings with source URLs. "
                "Do not include raw search results or detailed tool outputs. "
                "Do not create or edit files — return your findings directly. "
                "IMPORTANT: Always respond in the same language as the task description you received. "
                "If the task is in Chinese, respond in Chinese. If in English, respond in English."
            ),
            "tools": [internet_search],
            "middleware": [
                ModelRetryMiddleware(max_retries=3),
                ModelCallLimitMiddleware(run_limit=30),
                ToolRetryMiddleware(max_retries=2, tools=["internet_search"]),
                ToolCallLimitMiddleware(tool_name="internet_search", run_limit=15),
            ],
        }

        # -- Deep Agent (coordinator + subagents) --
        # Note: ModelCallLimitMiddleware is NOT used on the coordinator because it
        # conflicts with parallel subagent execution.
        _agent = create_deep_agent(
            model=model,
            system_prompt=(
                "You are a lead researcher. "
                f"Today's date is {today}. "
                "When the user asks a question, first briefly explain your research plan, "
                "then break the question into focused sub-questions and delegate via subagents. "
                "IMPORTANT: Write the task description in the same language as the user's message. "
                "After all results return, synthesize a concise, well-structured answer. "
                "Only use information your sub-agents reported — do not fabricate. "
                "Cite sources when available. Always respond in the user's language."
            ),
            subagents=[researcher_subagent],
            middleware=[
                ModelRetryMiddleware(max_retries=3),
            ],
            checkpointer=checkpointer,
            store=store,
            backend=CompositeBackend(
                StateBackend(),
                {
                    "/memories/": StoreBackend(
                        namespace=lambda _: ("agent", "memories"),
                    ),
                },
            ),
            memory=["/memories/AGENTS.md"],
        )
    else:
        logger.log("Agent already initialized, reusing")
    return _agent


# ─── SSE event stream generator ───

async def _event_stream(agent, message: str, conversation_id: str, utils):
    """Async generator that yields SSE-formatted strings.

    See module docstring for the event contract.
    """

    # ── id mapping ──
    #
    # The main agent's `task` tool_call_id (which the frontend uses as the
    # card id) is NOT the same as the subagent's pregel task id that appears
    # in the namespace as `tools:<pregelId>`. We associate them by arrival
    # order: when a new subagent namespace shows up, link it to the oldest
    # unmatched task tool_call_id. Same approach as the official lifecycle
    # example in the Deep Agents streaming guide.
    tool_call_to_subagent: dict[str, str] = {}
    subagent_to_tool_call: dict[str, str] = {}
    pending_tool_call_ids: list[str] = []

    # Dedup sets (the same updates snapshot can arrive multiple times).
    emitted_tool_call_ids: set[str] = set()
    emitted_tool_result_ids: set[str] = set()
    # Used to resolve a tool name on the `tool` completion event when the
    # ToolMessage itself doesn't carry one.
    tool_call_id_to_name: dict[str, str] = {}

    def extract_subagent_id(ns: tuple) -> str:
        # ns[0] looks like "tools:<pregelId>". Keep it short for display.
        if not ns:
            return ""
        return ns[0].split(":", 1)[-1][:8]

    def link_ids(tool_call_id: str, subagent_id: str) -> None:
        if not tool_call_id or not subagent_id:
            return
        tool_call_to_subagent[tool_call_id] = subagent_id
        subagent_to_tool_call[subagent_id] = tool_call_id
        if tool_call_id in pending_tool_call_ids:
            pending_tool_call_ids.remove(tool_call_id)

    def resolve_both_ids(tool_call_id: str = "", subagent_id: str = "") -> tuple[str, str]:
        if subagent_id and not tool_call_id:
            tool_call_id = subagent_to_tool_call.get(subagent_id, "")
        if tool_call_id and not subagent_id:
            subagent_id = tool_call_to_subagent.get(tool_call_id, "")
        return tool_call_id, subagent_id

    def send(event: dict) -> object:
        # Strip empty-string fields to keep the payload tight.
        return utils.sse({k: v for k, v in event.items() if v not in ("", None)})

    try:
        async for chunk in agent.astream(
            {"messages": [{"role": "user", "content": message}]},
            config={"configurable": {"thread_id": conversation_id}},
            stream_mode=["updates", "messages"],
            subgraphs=True,
            version="v2",
        ):
            mode = chunk.get("type")
            chunk_ns = chunk.get("ns") or ()
            chunk_data = chunk.get("data")

            is_subagent = any(s.startswith("tools:") for s in chunk_ns)

            # ── "updates" mode: lifecycle + tool events ──

            if mode == "updates":
                if not isinstance(chunk_data, dict):
                    continue

                for node_name, node_data in chunk_data.items():

                    # (A) Main agent's model node emitted `task` tool_calls
                    #     → a subagent has been spawned (pending).
                    #
                    # NOTE: the deployed langchain version names this node
                    # "model" (see langchain/agents/factory.py:
                    # `graph.add_node("model", ...)`). The public docs use
                    # "model_request" — accept both for forward compat.
                    if not is_subagent and node_name in ("model", "model_request"):
                        for msg in (node_data or {}).get("messages", []) or []:
                            for tc in getattr(msg, "tool_calls", []) or []:
                                if tc.get("name") != "task":
                                    continue
                                tc_id = tc.get("id") or ""
                                pending_tool_call_ids.append(tc_id)
                                yield send({
                                    "type": "subagent_pending",
                                    "source": "main",
                                    "tool_call_id": tc_id,
                                    "subagent_type": (tc.get("args") or {}).get("subagent_type", "researcher"),
                                    "description": ((tc.get("args") or {}).get("description", "") or "")[:500],
                                })

                    # (B) Any event under a subagent namespace → it's running.
                    if is_subagent:
                        sa_id = extract_subagent_id(chunk_ns)

                        # First time we see this subagent — link it to the
                        # oldest pending task tool_call_id by arrival order.
                        if (
                            sa_id
                            and sa_id not in subagent_to_tool_call
                            and pending_tool_call_ids
                        ):
                            link_ids(pending_tool_call_ids[0], sa_id)

                        tc_id, sa_id = resolve_both_ids(subagent_id=sa_id)

                        yield send({
                            "type": "subagent_step",
                            "source": "subagent",
                            "subagent_id": sa_id,
                            "tool_call_id": tc_id,
                        })

                        # (B1) Aggregated AIMessage.tool_calls — one event
                        #      per tool invocation, with full name + args +
                        #      real id. This is the single source of truth
                        #      for tool invocations.
                        if node_name in ("model", "model_request"):
                            for msg in (node_data or {}).get("messages", []) or []:
                                for tc in getattr(msg, "tool_calls", []) or []:
                                    name = tc.get("name") or ""
                                    if not name:
                                        continue
                                    tc_real_id = tc.get("id") or ""
                                    if tc_real_id and tc_real_id in emitted_tool_call_ids:
                                        continue
                                    if tc_real_id:
                                        emitted_tool_call_ids.add(tc_real_id)
                                        tool_call_id_to_name[tc_real_id] = name

                                    raw_args = tc.get("args")
                                    if isinstance(raw_args, str):
                                        args_str = raw_args
                                    elif raw_args is None:
                                        args_str = ""
                                    else:
                                        try:
                                            args_str = json.dumps(raw_args, ensure_ascii=False)
                                        except (TypeError, ValueError):
                                            args_str = ""

                                    yield send({
                                        "type": "tool_call",
                                        "source": "subagent",
                                        "name": name,
                                        "subagent_id": sa_id,
                                        "tool_call_id": tc_real_id,
                                        "args": args_str,
                                    })

                        # (B2) ToolMessage — flip the chip to "completed".
                        #      No body.
                        if node_name == "tools":
                            for msg in (node_data or {}).get("messages", []) or []:
                                if not (
                                    isinstance(msg, ToolMessage)
                                    or getattr(msg, "type", None) == "tool"
                                ):
                                    continue

                                tool_tc_id = getattr(msg, "tool_call_id", "") or ""
                                resolved_name = (
                                    getattr(msg, "name", None)
                                    or tool_call_id_to_name.get(tool_tc_id, "")
                                    or ""
                                )
                                if resolved_name == "task":
                                    continue  # handled by (C)
                                if tool_tc_id and tool_tc_id in emitted_tool_result_ids:
                                    continue
                                if tool_tc_id:
                                    emitted_tool_result_ids.add(tool_tc_id)

                                yield send({
                                    "type": "tool",
                                    "source": "subagent",
                                    "tool_name": resolved_name,
                                    "subagent_id": sa_id,
                                    "tool_call_id": tool_tc_id,
                                })

                    # (C) Main agent's tools node received a `task`
                    #     ToolMessage → that subagent is complete.
                    if not is_subagent and node_name == "tools":
                        for msg in (node_data or {}).get("messages", []) or []:
                            if getattr(msg, "type", None) != "tool":
                                continue
                            if getattr(msg, "name", None) != "task":
                                continue
                            raw_tc_id = getattr(msg, "tool_call_id", "") or ""
                            tc_id, sa_id = resolve_both_ids(tool_call_id=raw_tc_id)
                            yield send({
                                "type": "subagent_complete",
                                "source": "main",
                                "tool_call_id": tc_id,
                                "subagent_id": sa_id,
                            })

                continue

            # ── "messages" mode: stream assistant text tokens only ──
            # Tool-related chunks here are intentionally ignored: per-chunk
            # ids upstream are unreliable, and `updates` already gave us
            # authoritative tool events.

            if mode == "messages":
                if not chunk_data:
                    continue
                msg, _metadata = chunk_data
                if not isinstance(msg, AIMessageChunk):
                    continue
                if getattr(msg, "tool_call_chunks", None):
                    continue
                content = msg.content or ""
                if not isinstance(content, str) or not content:
                    continue
                content = re.sub(r"\n{3,}", "\n\n", content)
                if not content:
                    continue

                sa_id = ""
                tc_id = ""
                if is_subagent:
                    sa_id = extract_subagent_id(chunk_ns)
                    tc_id, sa_id = resolve_both_ids(subagent_id=sa_id)

                yield send({
                    "type": "ai",
                    "source": "subagent" if is_subagent else "main",
                    "content": content,
                    "subagent_id": sa_id,
                    "tool_call_id": tc_id,
                })

    except Exception as e:
        logger.error("stream error:", str(e))
        yield send({
            "type": "error",
            "source": "main",
            "content": f"Stream error: {type(e).__name__}: {str(e)[:200]}",
        })

    yield utils.sse("[DONE]")


# ─── EdgeOne Pages handler ───

async def handler(context):
    conversation_id = getattr(context, "conversation_id", None)
    logger.log("conversationId:", conversation_id,
               "runId:", getattr(context, "run_id", None))

    body = context.request.body or {}
    action = body.get("action", "chat")

    # Get memory adapters from context
    checkpointer = context.memory.langgraph_checkpointer
    store = context.memory.langgraph_store

    try:
        env = _get_env(context.env)
        model = _get_model(env)
        agent_instance = _get_agent(model, checkpointer, store)
    except Exception as e:
        msg = str(e)
        logger.error(msg)
        return {"status_code": 500, "body": {"error": msg}}

    # ── action: history — restore conversation from checkpointer ──
    if action == "history":
        thread_id = body.get("conversationId")
        logger.log("history request for threadId:", thread_id)
        if not thread_id:
            return {"status_code": 200, "body": {"items": []}}
        try:
            state = await agent_instance.aget_state(
                {"configurable": {"thread_id": thread_id}}
            )
            raw_messages = (state.values or {}).get("messages", []) if state else []

            # Build an ordered items array preserving the original conversation flow.
            # Each item has a type so the frontend can reconstruct messages + subagent groups.
            items = []

            # Map tool_call_id -> task info for matching ToolMessages later
            pending_tasks: dict[str, dict] = {}

            for m in raw_messages:
                msg_type = getattr(m, "type", None)

                if msg_type == "human":
                    content = getattr(m, "content", "")
                    if isinstance(content, str) and content:
                        items.append({"type": "user", "content": content})
                    continue

                if msg_type == "ai":
                    # Extract text content (may be string or list of content blocks)
                    content = getattr(m, "content", "")
                    if isinstance(content, str):
                        text_content = content
                    elif isinstance(content, list):
                        text_content = "".join(
                            p.get("text", "") for p in content
                            if isinstance(p, dict) and p.get("type") == "text"
                        )
                    else:
                        text_content = ""

                    # Check for task tool_calls (subagent delegations)
                    for tc in getattr(m, "tool_calls", []) or []:
                        if tc.get("name") == "task" and tc.get("id"):
                            pending_tasks[tc["id"]] = {
                                "description": ((tc.get("args") or {}).get("description", "") or "")[:500],
                                "subagentType": (tc.get("args") or {}).get("subagent_type", "researcher"),
                            }

                    if text_content:
                        items.append({"type": "coordinator", "content": text_content})
                    continue

                if msg_type == "tool":
                    tool_call_id = getattr(m, "tool_call_id", "") or ""
                    tool_name = getattr(m, "name", "") or ""
                    if tool_name == "task" and tool_call_id in pending_tasks:
                        task_info = pending_tasks.pop(tool_call_id)
                        result_content = getattr(m, "content", "")
                        items.append({
                            "type": "subagentTask",
                            "id": tool_call_id,
                            "description": task_info["description"],
                            "subagentType": task_info["subagentType"],
                            "content": result_content if isinstance(result_content, str) else "",
                        })
                    continue

            logger.log("history: found", len(items), "items")
            return {"status_code": 200, "body": {"items": items}}
        except Exception as e:
            logger.error("history error:", str(e))
            return {"status_code": 200, "body": {"items": []}}

    # ── action: chat (default) — normal SSE streaming ──
    message = body.get("message")
    logger.log("user message:", message)

    if not message:
        logger.error("Missing chat message")
        return {"status_code": 400, "body": "Missing chat message"}

    async def gen():
        agen = _event_stream(agent_instance, message, conversation_id, context.utils).__aiter__()
        cancel_task = asyncio.ensure_future(context.request.signal.wait())
        pending: asyncio.Task | None = None
        try:
            while True:
                if pending is None:
                    pending = asyncio.ensure_future(agen.__anext__())

                done, _ = await asyncio.wait(
                    {pending, cancel_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )

                if cancel_task in done:
                    logger.log("cancel signal received; aborting stream")
                    break

                try:
                    frame = pending.result()
                except StopAsyncIteration:
                    break
                pending = None
                yield frame
        finally:
            if pending is not None and not pending.done():
                pending.cancel()
                try:
                    await pending
                except BaseException:
                    pass
            if not cancel_task.done():
                cancel_task.cancel()
                try:
                    await cancel_task
                except BaseException:
                    pass
            try:
                await agen.aclose()
            except Exception as e:
                logger.error("agen.aclose error:", str(e))

    return context.utils.stream_sse(gen())
