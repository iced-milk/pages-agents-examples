import { useCallback, useEffect, useRef, useState } from "react";
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

  finalResult: CompleteEvent | null;
  errorMessage: string | null;

  isTransitioning: boolean;
  isStarted: boolean;
  isResuming: boolean;
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
  finalResult: null,
  errorMessage: null,
  isTransitioning: false,
  isStarted: false,
  isResuming: !!new URLSearchParams(window.location.search).get('id'),
};

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
            isStarted: true,
          }));
          break;

        case "node": {
          const node = ev.data.node as NodeName;
          patch((prev) => {
            const completed = new Set(prev.completedNodes);
            completed.add(node);

            const nodeLog: NodeLogEntry[] = [
              ...prev.nodeLog,
              { node },
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

  const { start: sseStart, answer: sseAnswer, resetConversation, resume: sseResume } =
    useQuizSSE(handleEvent);

  // Auto-resume from checkpointer on mount if URL has ?id=
  const hasAutoResumed = useRef(false);
  useEffect(() => {
    if (hasAutoResumed.current) return;
    hasAutoResumed.current = true;
    sseResume().then((data) => {
      if (!data || data.status === "no_session") {
        patch(() => ({ isResuming: false }));
        return;
      }
      const st = data.state;
      if (data.status === "completed") {
        const total = st.total_questions || 5;
        const attempts = st.total_attempts || 0;
        patch(() => ({
          isResuming: false,
          isStarted: true,
          question: st.question,
          options: st.options || [],
          questionNumber: st.question_number || 0,
          total,
          score: st.score || 0,
          maxAttempts: data.max_attempts || 2,
          status: "done",
          finalResult: {
            final_score: st.score || 0,
            total,
            total_attempts: attempts,
            avg_attempts: total ? Math.round((attempts / total) * 100) / 100 : 0,
            question_history: st.question_history || [],
          },
        }));
      } else {
        const hintGiven = st.hint_given ?? false;
        // Infer completed nodes from current state
        const completedList: string[] = ["generate_question"];
        if (hintGiven) {
          completedList.push("await_answer", "evaluate_answer", "give_hint");
        }
        const completed = new Set<string>(completedList);
        // Build placeholder node log entries for completed nodes
        const restoredLog: NodeLogEntry[] = completedList.map((node) => ({
          node,
        }));
        patch(() => ({
          isResuming: false,
          isStarted: true,
          question: st.question,
          options: st.options || [],
          questionNumber: st.question_number || 0,
          total: st.total_questions || 5,
          score: st.score || 0,
          maxAttempts: data.max_attempts || 2,
          currentAttempt: hintGiven ? 2 : 1,
          hintText: st.last_feedback && hintGiven ? st.last_feedback : "",
          status: "waiting",
          currentNode: "await_answer",
          completedNodes: completed,
          nodeLog: restoredLog,
        }));
      }
    }).catch(() => {
      patch(() => ({ isResuming: false }));
    });
  }, [sseResume, patch]);

  const start = useCallback(
    (lang: "zh" | "en") => {
      setS({ ...INITIAL, isResuming: false });
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
