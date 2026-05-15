export type NodeName =
  | "START"
  | "generate_question"
  | "await_answer"
  | "evaluate_answer"
  | "give_hint"
  | "finalize_question"
  | "update_progress"
  | "END";

export interface SessionEvent {
  thread_id: string;
  max_attempts: number;
}

export interface NodeEvent {
  node: NodeName | string;
  status: "active";
}

export interface QuestionEvent {
  question: string;
  options: string[];
  correct_option: string;
  question_number: number;
  total: number;
  max_attempts: number;
}

export interface ResultEvent {
  correct: boolean;
  correct_option: string | null;
  attempt: number;
  max_attempts: number;
}

export interface HintTokenEvent {
  delta: string;
}

export interface HintDoneEvent {
  hint: string;
}

export type FeedbackType = "correct_first" | "correct_after_hint" | "reveal";

export interface FeedbackEvent {
  type: FeedbackType;
  text: string;
  correct_option: string;
}

export interface ProgressEvent {
  score: number;
  question_number: number;
  total: number;
  total_attempts: number;
}

export interface WaitingEvent {
  reason?: string;
  attempt: number;
  max_attempts: number;
}

export interface QuestionHistoryItem {
  question: string;
  correct_option: string;
  user_answer: string;
  is_correct: boolean;
}

export interface CompleteEvent {
  final_score: number;
  total: number;
  total_attempts: number;
  avg_attempts: number;
  question_history?: QuestionHistoryItem[];
}

export interface ErrorEvent {
  message: string;
}

export type QuizEvent =
  | { type: "session"; data: SessionEvent }
  | { type: "node"; data: NodeEvent }
  | { type: "question"; data: QuestionEvent }
  | { type: "result"; data: ResultEvent }
  | { type: "hint_token"; data: HintTokenEvent }
  | { type: "hint_done"; data: HintDoneEvent }
  | { type: "feedback"; data: FeedbackEvent }
  | { type: "progress"; data: ProgressEvent }
  | { type: "waiting"; data: WaitingEvent }
  | { type: "complete"; data: CompleteEvent }
  | { type: "error"; data: ErrorEvent };
