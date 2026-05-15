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
  const history = result.question_history ?? [];

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

      {history.length > 0 && (
        <div className="mt-4 w-full max-w-lg text-left">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-400 uppercase tracking-wider">
                <th className="py-2 pr-3 font-medium text-left">#</th>
                <th className="py-2 pr-3 font-medium text-left">{t("quiz.history_question")}</th>
                <th className="py-2 pr-3 font-medium text-center">{t("quiz.history_answer")}</th>
                <th className="py-2 font-medium text-center">{t("quiz.history_correct")}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item, idx) => (
                <tr key={idx} className="border-b border-zinc-100 last:border-b-0">
                  <td className="py-2 pr-3 text-zinc-400 tabular-nums">{idx + 1}</td>
                  <td className="py-2 pr-3 text-zinc-700 leading-relaxed">{item.question}</td>
                  <td className={
                    "py-2 pr-3 text-center font-mono font-medium " +
                    (item.is_correct ? "text-green-600" : "text-red-500")
                  }>
                    {item.user_answer || "—"}
                  </td>
                  <td className="py-2 text-center font-mono font-medium text-zinc-600">
                    {item.correct_option}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
