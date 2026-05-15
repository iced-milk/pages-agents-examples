import { ChatOpenAI } from "@langchain/openai";
import { interrupt } from "@langchain/langgraph";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { Runnable } from "@langchain/core/runnables";
import type { AIMessageChunk } from "@langchain/core/messages";

import {
  QUESTION_SYSTEM_PROMPT,
  HINT_SYSTEM_PROMPT,
  languageName,
  formatPrompt,
} from "./prompts";
import { MAX_ATTEMPTS, type QuizStateType } from "./state";

export interface Env {
  AI_GATEWAY_API_KEY: string;
  AI_GATEWAY_BASE_URL: string;
}

let _questionModelCache: Runnable | null = null;
let _hintModelCache: ChatOpenAI | null = null;

function buildModel(env: Env, extra?: { temperature?: number; tags?: string[] }) {
  return new ChatOpenAI({
    model: "@Pages/hy3-preview",
    apiKey: env.AI_GATEWAY_API_KEY,
    configuration: {
      baseURL: env.AI_GATEWAY_BASE_URL,
      defaultHeaders: {
        "X-Gateway-Quota-Bypass": "true",
      },
    },
    temperature: extra?.temperature ?? 0.7,
    tags: extra?.tags,
    streamUsage: false,
  });
}

const GeneratedQuestionSchema = z.object({
  question: z.string().describe("The question text, one sentence when possible."),
  option_a: z.string().describe("Option A (without the 'A.' prefix)."),
  option_b: z.string().describe("Option B."),
  option_c: z.string().describe("Option C."),
  option_d: z.string().describe("Option D."),
  correct_option: z.string().describe("The correct option letter, one of 'A', 'B', 'C', 'D'."),
});

type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

export function initModels(env: Env) {
  if (!_questionModelCache) {
    _questionModelCache = buildModel(env, { temperature: 0.7 }).withConfig({
      tools: [
        {
          type: "function" as const,
          function: {
            name: "generate_question",
            description: "Generate a quiz question with 4 options and the correct letter.",
            parameters: zodToJsonSchema(GeneratedQuestionSchema),
          },
        },
      ],
      tool_choice: {
        type: "function" as const,
        function: { name: "generate_question" },
      },
    });
  }
  if (!_hintModelCache) {
    _hintModelCache = buildModel(env, { temperature: 0.7, tags: ["hint"] });
  }
}

function getQuestionModel(): Runnable {
  if (!_questionModelCache) throw new Error("Models not initialized, call initModels first");
  return _questionModelCache;
}

function getHintModel(): ChatOpenAI {
  if (!_hintModelCache) throw new Error("Models not initialized, call initModels first");
  return _hintModelCache;
}

// --- Nodes ---

export async function generateQuestion(
  state: QuizStateType,
  config: LangGraphRunnableConfig
): Promise<Partial<QuizStateType>> {
  const writer = config.writer!;

  const language = state.language ?? "zh";
  const questionNumber = (state.question_number ?? 0) + 1;
  const totalQuestions = state.total_questions ?? 5;

  const system = formatPrompt(QUESTION_SYSTEM_PROMPT, {
    language_name: languageName(language),
    asked_questions: state.current_question || "(none yet)",
  });
  const human =
    "Generate the next question now. Remember: write it in " +
    languageName(language) +
    ".";

  const response = (await getQuestionModel().invoke([
    { role: "system", content: system },
    { role: "user", content: human },
  ])) as AIMessageChunk;

  const toolCallArgs = response.tool_calls?.[0]?.args;
  if (!toolCallArgs) {
    throw new Error("LLM did not return a tool call with question data");
  }
  const result = GeneratedQuestionSchema.parse(toolCallArgs) as GeneratedQuestion;

  const options = [
    `A. ${result.option_a}`,
    `B. ${result.option_b}`,
    `C. ${result.option_c}`,
    `D. ${result.option_d}`,
  ];
  const correct = result.correct_option.trim().toUpperCase().charAt(0);

  writer({
    event: "question",
    question: result.question,
    options,
    correct_option: correct,
    question_number: questionNumber,
    total: totalQuestions,
    max_attempts: MAX_ATTEMPTS,
  });

  return {
    current_question: result.question,
    options,
    correct_option: correct,
    question_number: questionNumber,
    total_questions: totalQuestions,
    is_first_attempt: true,
    hint_given: false,
    last_feedback: "",
    user_answer: "",
    is_correct: false,
  };
}

export function awaitAnswer(state: QuizStateType): Partial<QuizStateType> {
  const answer: string = interrupt({
    reason: "waiting_for_answer",
    attempt: state.is_first_attempt !== false ? 1 : 2,
    max_attempts: MAX_ATTEMPTS,
  }) as string;

  const answerLetter = (answer || "").trim().toUpperCase().charAt(0);
  return { user_answer: answerLetter };
}

export function evaluateAnswer(
  state: QuizStateType,
  config: LangGraphRunnableConfig
): Partial<QuizStateType> {
  const writer = config.writer!;

  const isCorrect = state.user_answer === state.correct_option;
  const hintGiven = state.hint_given ?? false;
  let isFirstAttempt = state.is_first_attempt !== false;
  if (!isCorrect && isFirstAttempt) {
    isFirstAttempt = false;
  }

  const attemptNumber = !hintGiven ? 1 : 2;

  writer({
    event: "result",
    correct: isCorrect,
    correct_option: isCorrect ? state.correct_option : null,
    attempt: attemptNumber,
    max_attempts: MAX_ATTEMPTS,
  });

  return {
    is_correct: isCorrect,
    is_first_attempt: isFirstAttempt,
    total_attempts: (state.total_attempts ?? 0) + 1,
  };
}

export async function giveHint(
  state: QuizStateType,
  config: LangGraphRunnableConfig
): Promise<Partial<QuizStateType>> {
  const writer = config.writer!;

  const language = state.language ?? "zh";
  const system = formatPrompt(HINT_SYSTEM_PROMPT, {
    language_name: languageName(language),
    question: state.current_question,
    options: state.options.join("\n"),
    user_answer: state.user_answer,
  });
  const human =
    "Please give me one short hint, written in " + languageName(language) + ".";

  let hintText: string;
  try {
    const response = await getHintModel().invoke([
      { role: "system", content: system },
      { role: "user", content: human },
    ]);
    hintText =
      (typeof response.content === "string" ? response.content : "").trim() || "";
  } catch {
    hintText =
      language === "en"
        ? "Try thinking about the question from a different angle."
        : "换个角度再想一想这道题。";
  }

  writer({ event: "hint_done", hint: hintText });

  return { hint_given: true, last_feedback: hintText };
}

export function finalizeQuestion(
  state: QuizStateType,
  config: LangGraphRunnableConfig
): Partial<QuizStateType> {
  const writer = config.writer!;

  const language = state.language ?? "zh";
  const isCorrect = state.is_correct ?? false;
  const hintGiven = state.hint_given ?? false;
  const correctOption = state.correct_option ?? "";

  let feedbackType: string;
  let text: string;

  if (isCorrect && !hintGiven) {
    feedbackType = "correct_first";
    text = language === "zh" ? "答对了！" : "Correct on the first try!";
  } else if (isCorrect && hintGiven) {
    feedbackType = "correct_after_hint";
    text =
      language === "zh"
        ? "答对了！这次用了 2 次尝试。"
        : "Correct! You used 2 attempts.";
  } else {
    feedbackType = "reveal";
    text =
      language === "zh"
        ? `正确答案是 ${correctOption}。`
        : `The correct answer is ${correctOption}.`;
  }

  writer({
    event: "feedback",
    type: feedbackType,
    text,
    correct_option: correctOption,
  });

  return {
    last_feedback: text,
    question_history: [
      ...(state.question_history ?? []),
      {
        question: state.current_question,
        correct_option: state.options?.find((o: string) => o.startsWith(correctOption + ".")) || correctOption,
        user_answer: state.options?.find((o: string) => o.startsWith((state.user_answer ?? "") + ".")) ?? (state.user_answer ?? ""),
        is_correct: isCorrect,
      },
    ],
  };
}

export function updateProgress(
  state: QuizStateType,
  config: LangGraphRunnableConfig
): Partial<QuizStateType> {
  const writer = config.writer!;

  let score = state.score ?? 0;
  if (state.is_correct) {
    score += 1;
  }

  writer({
    event: "progress",
    score,
    question_number: state.question_number ?? 0,
    total: state.total_questions ?? 5,
    total_attempts: state.total_attempts ?? 0,
  });

  return { score };
}

// --- Conditional edge routers ---

export function routeAfterEvaluate(state: QuizStateType): string {
  if (state.is_correct) return "finalize_question";
  if (state.hint_given) return "finalize_question";
  return "give_hint";
}

export function routeAfterProgress(state: QuizStateType): string {
  if ((state.question_number ?? 0) >= (state.total_questions ?? 5)) return "__end__";
  return "generate_question";
}
