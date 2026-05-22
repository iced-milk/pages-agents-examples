import type { ReactNode } from "react";
import { useTranslation } from "../i18n";
import type { FeedbackType } from "../types";
import { CheckIcon, KeyIcon, LightBulbIcon, XIcon } from "./icons";

interface QuestionState {
  question: string;
  options: string[];
  questionNumber: number;
  total: number;
  maxAttempts: number;
  currentAttempt: number;
  disabledOptions: Set<string>;
  selectedOption: string | null;
  revealedCorrectOption: string | null;
  hintText: string;
  feedback: { type: FeedbackType; text: string } | null;
  status: "thinking" | "waiting" | "hinting" | "done";
  isTransitioning: boolean;
}

interface Props extends QuestionState {
  onSelect: (letter: string) => void;
}

export function QuizPanel(props: Props) {
  const { t } = useTranslation();

  if (props.status === "thinking" && !props.question) {
    return (
      <Card>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-zinc-500">
            <Spinner size="lg" />
            <p className="text-sm">{t("quiz.thinking")}</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <header className="flex items-center justify-between text-xs text-zinc-500 mb-5">
        <span className="font-mono tabular-nums">
          <span className="text-zinc-900 font-medium">
            {t("quiz.question_label")} {props.questionNumber}
          </span>
          <span className="text-zinc-300"> / {props.total}</span>
        </span>
        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-zinc-500">
          {t("quiz.attempts")} {props.currentAttempt}
          <span className="text-zinc-300">/{props.maxAttempts}</span>
        </span>
      </header>

      <h2 className="text-lg font-semibold text-zinc-900 leading-relaxed mb-6 tracking-tight">
        {props.question}
      </h2>

      <div className="grid gap-2">
        {props.options.map((opt) => {
          const letter = opt.slice(0, 1);
          const labelText = opt.replace(/^[A-D][.、]\s*/, "");
          const isWrongChosen = props.disabledOptions.has(letter);
          const isDisabled = isWrongChosen || props.status !== "waiting";
          const isSelected = props.selectedOption === letter;
          const isCorrectReveal =
            props.revealedCorrectOption === letter && props.status === "done";
          // Spinner while the backend evaluates the picked option.
          const isJudging =
            isSelected &&
            props.status === "thinking" &&
            !props.revealedCorrectOption;

          return (
            <button
              key={letter}
              disabled={isDisabled}
              onClick={() => props.onSelect(letter)}
              className={optionClass({
                isDisabled,
                isSelected,
                isCorrectReveal,
                isWrongChosen,
              })}
            >
              <span
                className={badgeClass({
                  isSelected,
                  isCorrectReveal,
                  isWrongChosen,
                })}
              >
                {letter}
              </span>
              <span
                className={
                  "flex-1 text-left leading-snug " +
                  (isWrongChosen ? "line-through" : "")
                }
              >
                {labelText}
              </span>
              {isJudging && <Spinner size="sm" />}
              {isWrongChosen && <XIcon className="w-4 h-4 text-red-500" />}
              {isCorrectReveal && <CheckIcon className="w-4 h-4 text-green-600" />}
            </button>
          );
        })}
      </div>

      {props.hintText && (
        <FeedbackCard
          tone="hint"
          icon={<LightBulbIcon className="w-4 h-4" />}
          title={t("quiz.hint_label")}
        >
          <span className="whitespace-pre-wrap">
            {props.hintText}
            {props.status === "hinting" && (
              <span className="inline-block w-1.5 h-3.5 bg-accent-600 ml-0.5 animate-pulse align-middle" />
            )}
          </span>
        </FeedbackCard>
      )}

      {props.feedback && (
        <FeedbackCard
          tone={feedbackTone(props.feedback.type)}
          icon={feedbackIcon(props.feedback.type)}
        >
          {props.feedback.text}
        </FeedbackCard>
      )}

      {props.isTransitioning && (
        <div className="mt-5 flex items-center gap-2 text-xs text-zinc-500">
          <Spinner size="sm" />
          <span>{t("quiz.preparing_next")}</span>
        </div>
      )}
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-6 md:p-8 flex flex-col min-h-[440px] animate-fade-in">
      {children}
    </div>
  );
}

function Spinner({ size }: { size: "sm" | "lg" }) {
  const cls = size === "lg" ? "w-6 h-6 border-[2.5px]" : "w-3 h-3 border-2";
  return (
    <span
      className={`${cls} rounded-full border-zinc-300 border-t-zinc-900 animate-spin shrink-0`}
      aria-hidden
    />
  );
}

function optionClass({
  isDisabled,
  isSelected,
  isCorrectReveal,
  isWrongChosen,
}: {
  isDisabled: boolean;
  isSelected: boolean;
  isCorrectReveal: boolean;
  isWrongChosen: boolean;
}) {
  const base =
    "flex items-center gap-3 px-4 py-3 rounded-md border text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1";

  if (isCorrectReveal) return `${base} border-green-600 bg-green-50 text-green-900`;
  if (isWrongChosen) return `${base} border-red-200 bg-red-50 text-red-700 cursor-not-allowed`;
  if (isSelected) return `${base} border-zinc-900 bg-zinc-50 text-zinc-900`;
  if (isDisabled) return `${base} border-zinc-200 bg-white text-zinc-400 cursor-not-allowed`;
  return `${base} border-zinc-200 bg-white text-zinc-800 hover:border-zinc-900 hover:bg-zinc-50 cursor-pointer`;
}

function badgeClass({
  isSelected,
  isCorrectReveal,
  isWrongChosen,
}: {
  isSelected: boolean;
  isCorrectReveal: boolean;
  isWrongChosen: boolean;
}) {
  const base =
    "flex items-center justify-center w-6 h-6 rounded text-xs font-mono font-semibold shrink-0";
  if (isCorrectReveal) return `${base} bg-green-600 text-white`;
  if (isWrongChosen) return `${base} bg-red-100 text-red-700`;
  if (isSelected) return `${base} bg-zinc-900 text-white`;
  return `${base} bg-zinc-100 text-zinc-600`;
}

function feedbackTone(type: FeedbackType): "correct" | "reveal" {
  return type === "reveal" ? "reveal" : "correct";
}

function feedbackIcon(type: FeedbackType) {
  if (type === "reveal") return <KeyIcon className="w-3 h-3" strokeWidth={2.5} />;
  return <CheckIcon className="w-3 h-3" strokeWidth={3} />;
}

function FeedbackCard({
  tone,
  icon,
  title,
  children,
}: {
  tone: "hint" | "correct" | "reveal";
  icon: ReactNode;
  title?: string;
  children: ReactNode;
}) {
  const palette = {
    hint: "bg-amber-50 border-amber-200 text-amber-900",
    correct:
      "bg-green-50 border-green-300 border-l-4 border-l-green-600 text-green-900 shadow-sm",
    reveal:
      "bg-blue-50 border-blue-300 border-l-4 border-l-blue-600 text-blue-900 shadow-sm",
  }[tone];

  const iconWrap = {
    hint: "text-amber-600",
    correct:
      "inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white",
    reveal:
      "inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white",
  }[tone];

  const textWeight = tone === "correct" || tone === "reveal" ? "font-medium" : "";

  return (
    <div className={`mt-5 rounded-md border p-3 flex gap-2.5 text-sm ${palette}`}>
      <span className={`shrink-0 mt-0.5 ${iconWrap}`}>{icon}</span>
      <div className={`leading-relaxed ${textWeight}`}>
        {title && <div className="font-medium mb-0.5">{title}</div>}
        {children}
      </div>
    </div>
  );
}
