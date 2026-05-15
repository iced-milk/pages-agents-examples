from __future__ import annotations

from typing import Any

from langchain.chat_models import init_chat_model
from langgraph.config import get_stream_writer
from langgraph.types import interrupt
from pydantic import BaseModel, Field

from .prompts import HINT_SYSTEM_PROMPT, QUESTION_SYSTEM_PROMPT, language_name
from .state import MAX_ATTEMPTS, QuizState

_question_model_cache: Any = None
_hint_model_cache: Any = None


def init_models(env: dict[str, str]):
    global _question_model_cache, _hint_model_cache
    if _question_model_cache is None:
        base = init_chat_model(
            model="@Pages/hy3-preview",
            api_key=env["AI_GATEWAY_API_KEY"],
            base_url=env["AI_GATEWAY_BASE_URL"],
            model_provider="openai",
            default_headers={"X-Gateway-Quota-Bypass": "true"},
            temperature=0.7,
        )
        _question_model_cache = base.with_structured_output(
            GeneratedQuestion, method="function_calling"
        )
    if _hint_model_cache is None:
        _hint_model_cache = init_chat_model(
            model="@Pages/hy3-preview",
            api_key=env["AI_GATEWAY_API_KEY"],
            base_url=env["AI_GATEWAY_BASE_URL"],
            model_provider="openai",
            default_headers={"X-Gateway-Quota-Bypass": "true"},
            temperature=0.7,
            tags=["hint"],
        )


def _get_question_model():
    if _question_model_cache is None:
        raise RuntimeError("Models not initialized, call init_models first")
    return _question_model_cache


def _get_hint_model():
    if _hint_model_cache is None:
        raise RuntimeError("Models not initialized, call init_models first")
    return _hint_model_cache


class GeneratedQuestion(BaseModel):
    question: str = Field(..., description="The question text, one sentence when possible.")
    option_a: str = Field(..., description="Option A (without the 'A.' prefix).")
    option_b: str = Field(..., description="Option B.")
    option_c: str = Field(..., description="Option C.")
    option_d: str = Field(..., description="Option D.")
    correct_option: str = Field(
        ..., description="The correct option letter, one of 'A', 'B', 'C', 'D'."
    )


# --- Nodes ---


def generate_question(state: QuizState) -> dict:
    writer = get_stream_writer()

    language = state.get("language", "zh")
    question_number = state.get("question_number", 0) + 1
    total_questions = state.get("total_questions", 5)

    system = QUESTION_SYSTEM_PROMPT.format(
        language_name=language_name(language),
        asked_questions=state.get("current_question") or "(none yet)",
    )
    human = (
        "Generate the next question now. Remember: write it in "
        + language_name(language)
        + "."
    )

    result: GeneratedQuestion = _get_question_model().invoke(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": human},
        ]
    )

    options = [
        f"A. {result.option_a}",
        f"B. {result.option_b}",
        f"C. {result.option_c}",
        f"D. {result.option_d}",
    ]
    correct = result.correct_option.strip().upper()[:1]

    writer({
        "event": "question",
        "question": result.question,
        "options": options,
        "correct_option": correct,
        "question_number": question_number,
        "total": total_questions,
        "max_attempts": MAX_ATTEMPTS,
    })

    return {
        "current_question": result.question,
        "options": options,
        "correct_option": correct,
        "question_number": question_number,
        "total_questions": total_questions,
        "is_first_attempt": True,
        "hint_given": False,
        "last_feedback": "",
        "user_answer": "",
        "is_correct": False,
    }


def await_answer(state: QuizState) -> dict:
    answer: str = interrupt({
        "reason": "waiting_for_answer",
        "attempt": 1 if state.get("is_first_attempt", True) else 2,
        "max_attempts": MAX_ATTEMPTS,
    })
    answer_letter = (answer or "").strip().upper()[:1]
    return {"user_answer": answer_letter}


def evaluate_answer(state: QuizState) -> dict:
    writer = get_stream_writer()

    is_correct = state["user_answer"] == state["correct_option"]
    hint_given = state.get("hint_given", False)
    is_first_attempt = state.get("is_first_attempt", True)
    if not is_correct and is_first_attempt:
        is_first_attempt = False

    attempt_number = 1 if not hint_given else 2

    writer({
        "event": "result",
        "correct": is_correct,
        "correct_option": state["correct_option"] if is_correct else None,
        "attempt": attempt_number,
        "max_attempts": MAX_ATTEMPTS,
    })

    return {
        "is_correct": is_correct,
        "is_first_attempt": is_first_attempt,
        "total_attempts": state.get("total_attempts", 0) + 1,
    }


def give_hint(state: QuizState) -> dict:
    writer = get_stream_writer()

    language = state.get("language", "zh")
    system = HINT_SYSTEM_PROMPT.format(
        language_name=language_name(language),
        question=state["current_question"],
        options="\n".join(state["options"]),
        user_answer=state["user_answer"],
    )
    human = "Please give me one short hint, written in " + language_name(language) + "."

    try:
        response = _get_hint_model().invoke([
            {"role": "system", "content": system},
            {"role": "user", "content": human},
        ])
        hint_text = (response.content or "").strip()
    except Exception:
        hint_text = (
            "Try thinking about the question from a different angle."
            if language == "en"
            else "换个角度再想一想这道题。"
        )

    writer({"event": "hint_done", "hint": hint_text})
    return {"hint_given": True, "last_feedback": hint_text}


def finalize_question(state: QuizState) -> dict:
    writer = get_stream_writer()

    language = state.get("language", "zh")
    is_correct = state.get("is_correct", False)
    hint_given = state.get("hint_given", False)
    correct_option = state.get("correct_option", "")

    if is_correct and not hint_given:
        feedback_type = "correct_first"
        text = "答对了！" if language == "zh" else "Correct on the first try!"
    elif is_correct and hint_given:
        feedback_type = "correct_after_hint"
        text = "答对了！这次用了 2 次尝试。" if language == "zh" else "Correct! You used 2 attempts."
    else:
        feedback_type = "reveal"
        text = f"正确答案是 {correct_option}。" if language == "zh" else f"The correct answer is {correct_option}."

    writer({
        "event": "feedback",
        "type": feedback_type,
        "text": text,
        "correct_option": correct_option,
    })

    options = state.get("options", [])
    user_answer = state.get("user_answer", "")
    correct_full = next((o for o in options if o.startswith(correct_option + ".")), correct_option)
    answer_full = next((o for o in options if o.startswith(user_answer + ".")), user_answer)

    return {
        "last_feedback": text,
        "question_history": [
            *(state.get("question_history") or []),
            {
                "question": state.get("current_question", ""),
                "correct_option": correct_full,
                "user_answer": answer_full,
                "is_correct": is_correct,
            },
        ],
    }


def update_progress(state: QuizState) -> dict:
    writer = get_stream_writer()

    score = state.get("score", 0)
    if state.get("is_correct"):
        score += 1

    writer({
        "event": "progress",
        "score": score,
        "question_number": state.get("question_number", 0),
        "total": state.get("total_questions", 5),
        "total_attempts": state.get("total_attempts", 0),
    })

    return {"score": score}


# --- Conditional edge routers ---


def route_after_evaluate(state: QuizState) -> str:
    if state.get("is_correct"):
        return "finalize_question"
    if state.get("hint_given"):
        return "finalize_question"
    return "give_hint"


def route_after_progress(state: QuizState) -> str:
    if state.get("question_number", 0) >= state.get("total_questions", 5):
        return "__end__"
    return "generate_question"
