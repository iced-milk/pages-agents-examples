import { END, START, StateGraph, MemorySaver } from "@langchain/langgraph";

import {
  awaitAnswer,
  evaluateAnswer,
  finalizeQuestion,
  generateQuestion,
  giveHint,
  routeAfterEvaluate,
  routeAfterProgress,
  updateProgress,
} from "./nodes";
import { QuizState } from "./state";

function buildGraph() {
  const graph = new StateGraph(QuizState)
    .addNode("generate_question", generateQuestion)
    .addNode("await_answer", awaitAnswer)
    .addNode("evaluate_answer", evaluateAnswer)
    .addNode("give_hint", giveHint)
    .addNode("finalize_question", finalizeQuestion)
    .addNode("update_progress", updateProgress)
    .addEdge(START, "generate_question")
    .addEdge("generate_question", "await_answer")
    .addEdge("await_answer", "evaluate_answer")
    .addConditionalEdges("evaluate_answer", routeAfterEvaluate, {
      give_hint: "give_hint",
      finalize_question: "finalize_question",
    })
    .addEdge("give_hint", "await_answer")
    .addEdge("finalize_question", "update_progress")
    .addConditionalEdges("update_progress", routeAfterProgress, {
      generate_question: "generate_question",
      __end__: END,
    });

  return graph.compile({ checkpointer: new MemorySaver() });
}

export const graph = buildGraph();
