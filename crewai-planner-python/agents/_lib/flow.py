"""TurnFlow — single Flow instance per conversation, paused/resumed via @human_feedback.

One kickoff() starts the entire conversation. Each @human_feedback step
pauses the Flow (provider raises HumanFeedbackPending). Next request
calls resume_async(feedback=user_message) to continue.

Lifecycle:
  kickoff → gather_step (PM asks) → pause
  resume  → after_gather → continue_gather / write
  ...     → gather_step (PM asks again) → pause
  resume  → after_gather → "write"
          → write_step (PM+TL produce docs) → pause
  resume  → iterate_step (PM+TL respond to feedback) → pause
  resume  → iterate_step → pause → ...forever
"""

from pydantic import BaseModel
from crewai.flow import Flow, listen, or_, router, start
from crewai.flow.human_feedback import human_feedback

from .feedback_provider import PROVIDER
from .llm import get_collapse_llm
from .logger import create_logger
from .._crews.discovery_crew.discovery_crew import DiscoveryCrew
from .._crews.planning_crew.planning_crew import PlanningCrew
from .._crews.iteration_crew.iteration_crew import IterationCrew

logger = create_logger("flow")

PM_MAX_ROUNDS = 3

# Placeholder for @human_feedback(llm=...) validation at class-body time.
# Real LLM is patched in via bind_collapse_llm() after init_llm().
_LLM_PLACEHOLDER = "openai/hy3-preview"


class TurnState(BaseModel):
    id: str = ""  # Set to conversation_id via kickoff(inputs={"id": cid})
    product_name: str = ""
    locale: str = "English"
    qa_history: str = ""
    rounds: int = 0
    latest_prd: str = ""
    latest_spec: str = ""
    chat_history: str = ""
    # Internal flag (private attr, not persisted)
    _pm_ready: bool = False


class TurnFlow(Flow[TurnState]):
    """Single Flow spanning the entire conversation."""

    stream = True

    # ── Gather phase: PM asks questions ──

    @start()
    def begin(self):
        pass

    @listen(or_(begin, "continue_gather"))
    @human_feedback(
        message="(user replies)",
        provider=PROVIDER,
    )
    def gather_step(self):
        """PM asks one question. Flow pauses for user reply."""
        s = self.state
        output = DiscoveryCrew().crew().kickoff(inputs={
            "product_name": s.product_name,
            "qa_history": s.qa_history or "(empty)",
            "locale": s.locale,
        })
        text = _crew_text(output)

        # Track state.
        s._pm_ready = "[READY]" in text
        s.rounds += 1
        # Append PM's output to qa_history.
        clean = text.replace("[READY]", "").strip()
        s.qa_history = (s.qa_history + f"\nPM: {clean}").strip()

        return clean  # → shown to user, then Flow pauses

    @router(gather_step)
    def after_gather(self):
        """Decide: keep asking or proceed to write."""
        if self.state._pm_ready or self.state.rounds >= PM_MAX_ROUNDS:
            logger.log(f"after_gather: done (rounds={self.state.rounds}, ready={self.state._pm_ready})")
            return "write"
        return "continue_gather"

    # ── Write phase: PM writes PRD + TL writes Spec ──

    @listen("write")
    @human_feedback(
        message="(user reviews documents)",
        provider=PROVIDER,
    )
    def write_step(self):
        """PM+TL produce PRD and Tech Spec. Flow pauses for user feedback."""
        s = self.state
        result = PlanningCrew().crew().kickoff(inputs={
            "product_name": s.product_name,
            "qa_history": s.qa_history,
            "existing_prd": "",
            "existing_spec": "",
            "iterate_feedback": "",
            "locale": s.locale,
        })
        # Store both documents separately for iterate phase.
        if hasattr(result, "tasks_output") and len(result.tasks_output) >= 2:
            s.latest_prd = str(result.tasks_output[0].raw or "").strip()
            s.latest_spec = str(result.tasks_output[1].raw or "").strip()
        else:
            s.latest_prd = _crew_text(result)
            s.latest_spec = ""
        # Return both for display (separated by marker for handler to split).
        return f"{s.latest_prd}\n[SPLIT]\n{s.latest_spec}"

    # ── Iterate phase: user gives feedback, PM+TL respond ──

    @listen(or_(write_step, "continue_iterate"))
    @human_feedback(
        message="(user gives feedback)",
        provider=PROVIDER,
    )
    def iterate_step(self):
        """PM responds to feedback, TL supplements. Flow pauses for next round."""
        s = self.state
        user_msg = ""
        if self.last_human_feedback:
            user_msg = self.last_human_feedback.feedback or ""

        output = IterationCrew().crew().kickoff(inputs={
            "product_name": s.product_name,
            "latest_prd": s.latest_prd or "(none)",
            "latest_spec": s.latest_spec or "(none)",
            "chat_history": s.chat_history,
            "user_message": user_msg,
            "locale": s.locale,
        })

        # Record PM and TL answers in chat_history (not Reviewer's suggestions)
        if hasattr(output, "tasks_output") and len(output.tasks_output) >= 2:
            pm_response = str(output.tasks_output[0].raw or "").strip()
            tl_response = str(output.tasks_output[1].raw or "").strip()
        elif hasattr(output, "tasks_output") and len(output.tasks_output) >= 1:
            pm_response = str(output.tasks_output[0].raw or "").strip()
            tl_response = ""
        else:
            pm_response = _crew_text(output)
            tl_response = ""

        # Update chat history.
        if user_msg:
            history_entry = f"\nBoss: {user_msg}\nPM: {pm_response}"
            if tl_response and tl_response.lower() not in ("n/a", "无补充"):
                history_entry += f"\nTL: {tl_response}"
            s.chat_history = (s.chat_history + history_entry).strip()

        return _crew_text(output)  # → shown to user, then Flow pauses

    @router(iterate_step)
    def after_iterate(self):
        """Route to finalize (end) or continue iterating."""
        feedback = ""
        if self.last_human_feedback:
            feedback = self.last_human_feedback.feedback or ""
        if any(k in feedback for k in ("确认完成", "finalize", "looks good")):
            return "finalize"
        return "continue_iterate"

    # ── Finalize: output final documents, Flow ends ──

    @listen("finalize")
    def finalize_step(self):
        """PM outputs final PRD, TL outputs final Spec. No @human_feedback → Flow completes."""
        s = self.state
        output = PlanningCrew().crew().kickoff(inputs={
            "product_name": s.product_name,
            "qa_history": s.qa_history,
            "existing_prd": f"--- Current PRD (revise into final version incorporating all feedback) ---\n{s.latest_prd}" if s.latest_prd else "",
            "existing_spec": f"--- Current Tech Spec (revise into final version incorporating all feedback) ---\n{s.latest_spec}" if s.latest_spec else "",
            "iterate_feedback": f"--- Iteration feedback (ALL items below MUST be incorporated into the final version) ---\n{s.chat_history}\n\nIMPORTANT: Every single feedback item above must be reflected in the final document. Do not skip any. This is the FINAL version." if s.chat_history else "",
            "locale": s.locale,
        })
        return _crew_text(output)


# ── Post-init: wire real collapse LLM ──

def bind_collapse_llm():
    """Patch the real LLM into @human_feedback methods after init_llm()."""
    llm = get_collapse_llm()
    for name in ("gather_step", "write_step", "iterate_step"):
        method = getattr(TurnFlow, name, None)
        if method:
            setattr(method, "_hf_llm", llm)


def _crew_text(output) -> str:
    raw = getattr(output, "raw", None)
    return str(raw).strip() if raw else str(output).strip()
