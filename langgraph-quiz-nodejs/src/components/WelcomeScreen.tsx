import { useTranslation } from "../i18n";
import { ArrowRightIcon } from "./icons";

export function WelcomeScreen({ onStart, loading }: { onStart: () => void; loading: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-10 md:p-12 min-h-[480px] flex flex-col items-center justify-center gap-6 text-center animate-fade-in">
      <h2 className="text-2xl font-semibold text-zinc-900 tracking-tight">
        {t("nav.title")}
      </h2>
      <p className="text-sm text-zinc-500 max-w-md leading-relaxed">
        {t("quiz.subtitle")}
      </p>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <FeatureDot>{t("quiz.feature_ai")}</FeatureDot>
        <Divider />
        <FeatureDot>{t("quiz.feature_flow")}</FeatureDot>
        <Divider />
        <FeatureDot>{t("quiz.feature_win")}</FeatureDot>
      </div>

      <button
        onClick={onStart}
        disabled={loading}
        className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
      >
        {loading ? (
          <>
            <Spinner />
            <span>...</span>
          </>
        ) : (
          <>
            <span>{t("quiz.start_button")}</span>
            <ArrowRightIcon className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );
}

function FeatureDot({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-zinc-700">{children}</span>;
}

function Divider() {
  return <span className="text-zinc-300" aria-hidden>·</span>;
}

function Spinner() {
  return (
    <span
      className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin"
      aria-hidden
    />
  );
}
