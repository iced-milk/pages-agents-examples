import { useTranslation, type Lang } from "../i18n";

export function LanguageSwitch() {
  const { lang, setLang } = useTranslation();

  return (
    <div className="inline-flex rounded-md border border-zinc-200 p-0.5 text-xs bg-white">
      {(["zh", "en"] as Lang[]).map((opt) => (
        <button
          key={opt}
          onClick={() => setLang(opt)}
          className={
            "px-3 py-1 rounded-[4px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-1 " +
            (lang === opt
              ? "bg-zinc-900 text-white"
              : "text-zinc-600 hover:text-zinc-900")
          }
          aria-pressed={lang === opt}
        >
          {opt === "zh" ? "中文" : "EN"}
        </button>
      ))}
    </div>
  );
}
