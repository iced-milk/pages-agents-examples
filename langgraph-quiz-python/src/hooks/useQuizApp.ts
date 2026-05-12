import { useCallback, useRef, useState } from "react";
import type { NodeLogEntry } from "../components/EventLog";
import { useQuizSSE } from "./useQuizSSE";
import type {
  CompleteEvent,
  FeedbackEvent,
  NodeName,
  QuizEvent,
} from "../types";

export type PanelStatus = "idle" | "thinking" | "waiting" | "hinting" | "done";

export interface QuizAppState {
  maxAttempts: number;

  question: string;
  options: string[];
  questionNumber: number;
  total: number;
  currentAttempt: number;

  disabledOptions: Set<string>;
  selectedOption: string | null;
  revealedCorrect: string | null;
  hintText: string;
  feedback: FeedbackEvent | null;
  status: PanelStatus;

  score: number;

  currentNode: NodeName | null;
  completedNodes: Set<string>;
  nodeLog: NodeLogEntry[];
  roundStartTime: number;

  finalResult: CompleteEvent | null;
  errorMessage: string | null;

  isTransitioning: boolean;
  isStarted: boolean;
}

const INITIAL: QuizAppState = {
  maxAttempts: 2,
  question: "",
  options: [],
  questionNumber: 0,
  total: 0,
  currentAttempt: 1,
  disabledOptions: new Set(),
  selectedOption: null,
  revealedCorrect: null,
  hintText: "",
  feedback: null,
  status: "idle",
  score: 0,
  currentNode: null,
  completedNodes: new Set(),
  nodeLog: [],
  roundStartTime: 0,
  finalResult: null,
  errorMessage: null,
  isTransitioning: false,
  isStarted: false,
};

function isSlowNode(name: string | null): boolean {
  return (
    name === "generate_question" ||
    name === "await_answer" ||
    name === "give_hint"
  );
}

export function useQuizApp() {
  const [s, setS] = useState<QuizAppState>(INITIAL);

  const patch = useCallback(
    (fn: (prev: QuizAppState) => Partial<QuizAppState>) => {
      setS((prev) => ({ ...prev, ...fn(prev) }));
    },
    []
  );

  const lastSelectedRef = useRef<string | null>(null);
  const stateRef = useRef<QuizAppState>(s);
  stateRef.current = s;

  const handleEvent = useCallback(
    (ev: QuizEvent) => {
      switch (ev.type) {
        case "session":
          patch(() => ({
            maxAttempts: ev.data.max_attempts,
            status: "thinking",
            finalResult: null,
            errorMessage: null,
            currentNode: "generate_question",
            roundStartTime: Date.now(),
            isStarted: true,
          }));
          break;

        case "node": {
          const node = ev.data.node as NodeName;
          patch((prev) => {
            const completed = new Set(prev.completedNodes);
            completed.add(node);

            const finishedAt = Date.now();
            const startedAt =
              prev.nodeLog.length === 0
                ? prev.roundStartTime || finishedAt
                : prev.nodeLog[prev.nodeLog.length - 1].finishedAt;
            const nodeLog: NodeLogEntry[] = [
              ...prev.nodeLog,
              { node, startedAt, finishedAt, slow: isSlowNode(node) },
            ];

            const partial: Partial<QuizAppState> = {
              completedNodes: completed,
              nodeLog,
            };

            if (node === "update_progress") {
              const moreToGo =
                prev.questionNumber < (prev.total || Infinity) &&
                !prev.finalResult;
              if (moreToGo) {
                partial.currentNode = "generate_question";
                partial.isTransitioning = true;
                partial.status = "thinking";
                partial.roundStartTime = Date.now();
              }
            }
            return partial;
          });
          break;
        }

        case "question": {
          const q = ev.data;
          patch((prev) => {
            const isNewRound =
              prev.questionNumber > 0 &&
              q.question_number !== prev.questionNumber;
            return {
              question: q.question,
              options: q.options,
              questionNumber: q.question_number,
              total: q.total,
              maxAttempts: q.max_attempts,
              currentAttempt: 1,
              disabledOptions: new Set(),
              selectedOption: null,
              revealedCorrect: null,
              hintText: "",
              feedback: null,
              status: "thinking",
              isTransitioning: false,
              currentNode: "await_answer",
              nodeLog: isNewRound ? [] : prev.nodeLog,
              completedNodes: isNewRound ? new Set() : prev.completedNodes,
            };
          });
          break;
        }

        case "waiting":
          patch(() => ({
            currentAttempt: ev.data.attempt,
            status: "waiting",
            currentNode: "await_answer",
          }));
          break;

        case "result": {
          const r = ev.data;
          patch((prev) => {
            if (r.correct) {
              return {
                revealedCorrect: prev.selectedOption,
                status: "done",
                currentNode: null,
              };
            }
            const disabled = new Set(prev.disabledOptions);
            if (lastSelectedRef.current) {
              disabled.add(lastSelectedRef.current);
            }
            return {
              disabledOptions: disabled,
              selectedOption: null,
              currentNode: prev.hintText ? null : "give_hint",
            };
          });
          break;
        }

        case "hint_token":
          patch((prev) => ({
            hintText: (prev.hintText || "") + ev.data.delta,
            status: "hinting",
            currentNode: "give_hint",
          }));
          break;

        case "hint_done":
          patch(() => ({
            hintText: ev.data.hint,
            status: "waiting",
            currentNode: "await_answer",
          }));
          break;

        case "feedback":
          patch(() => ({
            feedback: ev.data,
            revealedCorrect: ev.data.correct_option,
            status: "done",
            currentNode: null,
          }));
          break;

        case "progress":
          patch(() => ({ score: ev.data.score }));
          break;

        case "complete":
          patch((prev) => {
            const completed = new Set(prev.completedNodes);
            completed.add("update_progress");
            completed.add("END");
            return {
              finalResult: ev.data,
              currentNode: null,
              completedNodes: completed,
              status: "done",
              isTransitioning: false,
            };
          });
          break;

        case "error":
          patch(() => ({ errorMessage: ev.data.message, status: "idle" }));
          break;

        default:
          break;
      }
    },
    [patch]
  );

  const { start: sseStart, answer: sseAnswer, resetConversation } =
    useQuizSSE(handleEvent);

  const start = useCallback(
    (lang: "zh" | "en") => {
      setS({ ...INITIAL });
      lastSelectedRef.current = null;
      resetConversation();
      sseStart(lang);
    },
    [sseStart, resetConversation]
  );

  const answer = useCallback(
    (letter: string) => {
      const current = stateRef.current;
      if (!current.isStarted || current.status !== "waiting") return;
      lastSelectedRef.current = letter;
      patch(() => ({ selectedOption: letter, status: "thinking" }));
      sseAnswer(letter);
    },
    [sseAnswer, patch]
  );

  const dismissError = useCallback(
    () => patch(() => ({ errorMessage: null })),
    [patch]
  );

  return { state: s, start, answer, dismissError };
}
