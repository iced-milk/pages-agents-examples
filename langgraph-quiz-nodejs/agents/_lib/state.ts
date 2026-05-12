import { StateSchema } from "@langchain/langgraph";
import { z } from "zod";

export const MAX_ATTEMPTS = 2;

export const QuizState = new StateSchema({
  current_question: z.string(),
  options: z.array(z.string()),
  correct_option: z.string(),

  user_answer: z.string(),
  is_correct: z.boolean(),

  is_first_attempt: z.boolean(),
  hint_given: z.boolean(),
  last_feedback: z.string(),

  question_number: z.number(),
  total_questions: z.number(),
  score: z.number(),
  total_attempts: z.number(),

  language: z.string(),
});

export type QuizStateType = typeof QuizState.State;
