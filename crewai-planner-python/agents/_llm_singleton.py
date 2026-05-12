"""LLM singleton — lazy-initialized from context.env on first request."""

from crewai import LLM
from ._logger import create_logger

logger = create_logger("llm")

_llm = None


def init_llm(context_env):
    """Initialize LLM from context.env on first request, reuse afterwards."""
    global _llm
    if _llm is not None:
        logger.log("LLM already initialized, reusing")
        return _llm

    env = context_env or {}
    api_key = env.get("AI_GATEWAY_API_KEY", "")
    base_url = env.get("AI_GATEWAY_BASE_URL", "")
    if not api_key or not base_url:
        raise RuntimeError("Missing AI_GATEWAY_API_KEY or AI_GATEWAY_BASE_URL")

    logger.log("Initializing LLM...")
    _llm = LLM(
        model="openai/@Pages/hy3-preview",
        api_key=api_key,
        base_url=base_url,
        temperature=0,
        timeout=300,
        stream=True,
        extra_headers={"X-Gateway-Quota-Bypass": "true"},
    )
    return _llm


def get_llm():
    """Get the initialized LLM instance. Must call init_llm() first."""
    if _llm is None:
        raise RuntimeError("LLM not initialized. Call init_llm(context.env) first.")
    return _llm
