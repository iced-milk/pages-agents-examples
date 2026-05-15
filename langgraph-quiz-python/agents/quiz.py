import asyncio
import json
import re
from typing import Any, AsyncIterator

from langgraph.types import Command

from ._lib.graph import build_graph
from ._lib.nodes import init_models
from ._lib.state import MAX_ATTEMPTS
from ._lib.logger import create_logger

logger = create_logger("quiz")

# ─── Singleton graph (lazy init with platform checkpointer) ───

_graph = None


def _get_graph(checkpointer, store):
    global _graph
    if _graph is None:
        logger.log("Initializing graph with platform checkpointer and store...")
        _graph = build_graph(checkpointer, store)
    return _graph


def _get_env(context_env) -> dict[str, str]:
    source = context_env or {}
    required = ("AI_GATEWAY_API_KEY", "AI_GATEWAY_BASE_URL")
    missing = [k for k in required if not (source.get(k) or "").strip()]
    if missing:
        raise RuntimeError(f"Missing environment variables: {', '.join(missing)}")
    return {k: source[k] for k in required}


def _sse_frame(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _run_graph(graph_instance, payload: Any, config: dict) -> AsyncIterator[str]:
    try:
        async for chunk in graph_instance.astream(
            payload, config=config, stream_mode=["updates", "custom", "messages"], version="v2"
        ):
            mode = chunk["type"]
            data = chunk["data"]

            if mode == "updates":
                if "__interrupt__" in data:
                    interrupt_value = data["__interrupt__"][0].value or {}
                    yield _sse_frame("waiting", interrupt_value)
                    continue
                for node_name in data.keys():
                    yield _sse_frame("node", {"node": node_name, "status": "active"})

            elif mode == "custom":
                event_name = data.get("event", "custom")
                payload_out = {k: v for k, v in data.items() if k != "event"}
                yield _sse_frame(event_name, payload_out)

            elif mode == "messages":
                message_chunk, metadata = data
                tags = (metadata or {}).get("tags") or []
                if "hint" not in tags:
                    continue
                delta = getattr(message_chunk, "content", "") or ""
                if not delta:
                    continue
                yield _sse_frame("hint_token", {"delta": delta})

        state = await graph_instance.aget_state(config)
        if not state.next:
            final_values = state.values or {}
            total = final_values.get("total_questions") or 0
            attempts = final_values.get("total_attempts") or 0
            avg = round(attempts / total, 2) if total else 0
            yield _sse_frame("complete", {
                "final_score": final_values.get("score", 0),
                "total": total,
                "total_attempts": attempts,
                "avg_attempts": avg,
                "question_history": final_values.get("question_history") or [],
            })

    except Exception as exc:
        logger.error("stream error:", str(exc))
        yield _sse_frame("error", {"message": str(exc)})


async def _handle_start(graph_instance, context, body: dict):
    conversation_id = context.conversation_id
    language = body.get("language", "zh")
    total_questions = body.get("total_questions", 5)

    if language not in ("zh", "en"):
        return {"status_code": 400, "body": {"detail": "language must be 'zh' or 'en'"}}

    config = {"configurable": {"thread_id": conversation_id}}
    initial = {
        "language": language,
        "total_questions": total_questions,
        "question_number": 0,
        "score": 0,
        "total_attempts": 0,
    }

    logger.log("start quiz, conversationId:", conversation_id)

    async def gen():
        yield _sse_frame("session", {"thread_id": conversation_id, "max_attempts": MAX_ATTEMPTS})
        async for frame in _stream_with_cancel(context, _run_graph(graph_instance, initial, config)):
            yield frame

    return context.utils.stream_sse(gen())


async def _handle_answer(graph_instance, context, body: dict):
    conversation_id = context.conversation_id
    answer = body.get("answer")

    if not answer:
        return {"status_code": 400, "body": {"detail": "answer is required"}}

    if not re.match(r"^[A-Da-d]$", answer):
        return {"status_code": 400, "body": {"detail": "answer must be A, B, C, or D"}}

    config = {"configurable": {"thread_id": conversation_id}}

    try:
        state = await graph_instance.aget_state(config)
        if not state.next:
            return {"status_code": 400, "body": {"detail": "thread already finished"}}
    except Exception:
        return {"status_code": 400, "body": {"detail": "unknown thread"}}

    answer_letter = answer.strip().upper()
    logger.log("answer:", answer_letter, "conversationId:", conversation_id)

    async def gen():
        async for frame in _stream_with_cancel(
            context, _run_graph(graph_instance, Command(resume=answer_letter), config)
        ):
            yield frame

    return context.utils.stream_sse(gen())


async def _handle_resume(graph_instance, conversation_id):
    config = {"configurable": {"thread_id": conversation_id}}
    try:
        state = await graph_instance.aget_state(config)
        if not state.values:
            return {"status": "no_session"}

        v = state.values
        is_finished = not state.next

        return {
            "status": "completed" if is_finished else "in_progress",
            "state": {
                "question": v.get("current_question", ""),
                "options": v.get("options", []),
                "correct_option": v.get("correct_option", ""),
                "question_number": v.get("question_number", 0),
                "total_questions": v.get("total_questions", 5),
                "score": v.get("score", 0),
                "total_attempts": v.get("total_attempts", 0),
                "is_first_attempt": v.get("is_first_attempt", True),
                "hint_given": v.get("hint_given", False),
                "last_feedback": v.get("last_feedback", ""),
                "language": v.get("language", "zh"),
                "question_history": v.get("question_history") or [],
            },
            "max_attempts": MAX_ATTEMPTS,
        }
    except Exception:
        return {"status": "no_session"}


def _handle_graph(graph_instance):
    mermaid_src = graph_instance.get_graph().draw_mermaid(with_styles=False)
    return {"mermaid": mermaid_src}


async def _stream_with_cancel(context, agen_source: AsyncIterator[str]):
    """Wrap an async iterator with cancel signal support."""
    agen = agen_source.__aiter__()
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


async def handler(context):
    logger.log("conversationId:", getattr(context, "conversation_id", None),
               "runId:", getattr(context, "run_id", None))

    body = context.request.body or {}
    action = body.get("action")

    if not action:
        return {"status_code": 400, "body": {"detail": "action is required"}}

    try:
        init_models(_get_env(context.env))
    except Exception as e:
        msg = str(e)
        logger.error(msg)
        return {"status_code": 500, "body": {"error": msg}}

    # Get memory adapters from context
    checkpointer = context.store.langgraph_checkpointer
    store = context.store.langgraph_store
    graph_instance = _get_graph(checkpointer, store)

    match action:
        case "start":
            return await _handle_start(graph_instance, context, body)
        case "answer":
            return await _handle_answer(graph_instance, context, body)
        case "resume":
            return await _handle_resume(graph_instance, context.conversation_id)
        case "graph":
            return _handle_graph(graph_instance)
        case _:
            return {"status_code": 400, "body": {"detail": f"Unknown action: {action}"}}
