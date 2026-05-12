import { useTranslation } from "../i18n";

interface Props {
  score: number;
  questionNumber: number;
  total: number;
}

export function ScoreBoard({ score, questionNumber, total }: Props) {
  const { t } = useTranslation();
  const progress = total > 0 ? (questionNumber / total) * 100 : 0;

  return (
    <div className="flex flex-col gap-2 max-w-6xl mx-auto">
      <div className="flex items-center gap-8 text-xs">
        <Stat label={t("quiz.score")} value={score} total={total} tone="score" />
        <span className="w-px h-5 bg-zinc-200" aria-hidden />
        <Stat
          label={t("quiz.question_label")}
          value={questionNumber || 0}
          total={total}
          tone="neutral"
        />
      </div>
      {total > 0 && (
        <div className="h-[2px] w-full bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-600 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: "score" | "neutral";
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
        {label}
      </span>
      <span className="flex items-baseline font-mono tabular-nums">
        <span
          className={
            "text-base font-semibold " +
            (tone === "score" ? "text-zinc-900" : "text-zinc-700")
          }
        >
          {value}
        </span>
        <span className="mx-0.5 text-zinc-300">/</span>
        <span className="text-zinc-400">{total}</span>
      </span>
    </div>
  );
}
