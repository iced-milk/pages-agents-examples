"""LLM singletons — streaming (for Crews) + non-streaming (for @human_feedback collapse)."""

from crewai import LLM
from .logger import create_logger

logger = create_logger("llm")

_llm = None
_collapse_llm = None


def init_llm(context_env):
    global _llm, _collapse_llm
    if _llm is not None:
        return _llm

    env = context_env or {}
    api_key = env.get("AI_GATEWAY_API_KEY", "")
    base_url = env.get("AI_GATEWAY_BASE_URL", "")
    if not api_key or not base_url:
        raise RuntimeError("Missing AI_GATEWAY_API_KEY or AI_GATEWAY_BASE_URL")

    logger.log("Initializing LLM...")
    _llm = LLM(
        model="openai/@makers/deepseek-v4-flash",
        api_key=api_key,
        base_url=base_url,
        temperature=0,
        timeout=300,
        stream=True,
    )
    _collapse_llm = LLM(
        model="openai/deepseek-v4-flash",
        api_key=api_key,
        base_url=base_url,
        temperature=0,
        timeout=60,
        stream=False,
    )
    return _llm


def get_llm():
    if _llm is None:
        raise RuntimeError("Call init_llm() first.")
    return _llm


def get_collapse_llm():
    if _collapse_llm is None:
        raise RuntimeError("Call init_llm() first.")
    return _collapse_llm
