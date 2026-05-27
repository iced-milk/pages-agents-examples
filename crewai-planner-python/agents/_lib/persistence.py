"""In-process FlowPersistence for TurnFlow pause/resume.

Sticky routing ensures same cid → same instance → dict is reliable.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from crewai.flow.async_feedback.types import PendingFeedbackContext
from crewai.flow.persistence.base import FlowPersistence

_state_store: dict[str, dict[str, Any]] = {}
_pending_store: dict[str, tuple[dict[str, Any], PendingFeedbackContext]] = {}


def _to_dict(state) -> dict[str, Any]:
    if isinstance(state, dict):
        return dict(state)
    if isinstance(state, BaseModel):
        return state.model_dump()
    return dict(state)


class PagesPersistence(FlowPersistence):
    """FlowPersistence backed by process-local dicts."""

    persistence_type: str = "pages-memory"

    def init_db(self) -> None:
        pass

    def save_state(self, flow_uuid: str, method_name: str, state_data) -> None:
        _state_store[flow_uuid] = _to_dict(state_data)

    def load_state(self, flow_uuid: str) -> dict[str, Any] | None:
        return _state_store.get(flow_uuid)

    def save_pending_feedback(self, flow_uuid: str, context, state_data) -> None:
        _pending_store[flow_uuid] = (_to_dict(state_data), context)

    def load_pending_feedback(self, flow_uuid: str):
        return _pending_store.get(flow_uuid)

    def clear_pending_feedback(self, flow_uuid: str) -> None:
        _pending_store.pop(flow_uuid, None)


_INSTANCE: PagesPersistence | None = None


def get_persistence() -> PagesPersistence:
    global _INSTANCE
    if _INSTANCE is None:
        _INSTANCE = PagesPersistence()
    return _INSTANCE


def has_pending(cid: str) -> bool:
    return cid in _pending_store
