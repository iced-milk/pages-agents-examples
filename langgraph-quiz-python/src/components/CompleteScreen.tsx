import { useTranslation } from "../i18n";
import { RefreshIcon, SparklesIcon } from "./icons";
import type { CompleteEvent } from "../types";

export function CompleteScreen({
  result,
  onRestart,
}: {
  result: CompleteEvent;
  onRestart: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-10 md:p-12 min-h-[440px] flex flex-col items-center justify-center gap-5 text-center animate-fade-in">
      <div className="inline-flex w-12 h-12 rounded-full bg-green-50 text-green-600 items-center justify-center">
        <SparklesIcon className="w-6 h-6" />
      </div>

      <h2 className="text-2xl font-semibold text-zinc-900 tracking-tight">
        {t("quiz.complete_title")}
      </h2>

      <p className="text-sm text-zinc-500">
        {t("quiz.complete_score", {
          score: result.final_score,
          total: result.total,
        })}
      </p>

      <div className="mt-2 flex items-center gap-6 font-mono text-xs text-zinc-500 tabular-nums">
        <Stat
          value={`${result.final_score}/${result.total}`}
          label={t("quiz.score")}
        />
        <span className="w-px h-5 bg-zinc-200" aria-hidden />
        <Stat value={result.avg_attempts.toFixed(1)} label="avg attempts" />
      </div>

      <button
        onClick={onRestart}
        className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
      >
        <RefreshIcon className="w-4 h-4" />
        {t("quiz.restart_button")}
      </button>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-lg font-semibold text-zinc-900">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </span>
    </div>
  );
}
