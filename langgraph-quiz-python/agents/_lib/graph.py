from langgraph.graph import END, START, StateGraph

from .nodes import (
    await_answer,
    evaluate_answer,
    finalize_question,
    generate_question,
    give_hint,
    route_after_evaluate,
    route_after_progress,
    update_progress,
)
from .state import QuizState


def build_graph(checkpointer=None, store=None):
    builder = StateGraph(QuizState)

    builder.add_node("generate_question", generate_question)
    builder.add_node("await_answer", await_answer)
    builder.add_node("evaluate_answer", evaluate_answer)
    builder.add_node("give_hint", give_hint)
    builder.add_node("finalize_question", finalize_question)
    builder.add_node("update_progress", update_progress)

    builder.add_edge(START, "generate_question")
    builder.add_edge("generate_question", "await_answer")
    builder.add_edge("await_answer", "evaluate_answer")
    builder.add_conditional_edges(
        "evaluate_answer",
        route_after_evaluate,
        {
            "give_hint": "give_hint",
            "finalize_question": "finalize_question",
        },
    )
    builder.add_edge("give_hint", "await_answer")
    builder.add_edge("finalize_question", "update_progress")
    builder.add_conditional_edges(
        "update_progress",
        route_after_progress,
        {
            "generate_question": "generate_question",
            "__end__": END,
        },
    )

    return builder.compile(checkpointer=checkpointer, store=store)

