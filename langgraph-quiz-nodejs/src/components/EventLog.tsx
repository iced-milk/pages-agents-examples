import { useEffect, useRef } from "react";
import { useTranslation } from "../i18n";

export interface NodeLogEntry {
  node: string;
}

interface Props {
  entries: NodeLogEntry[];
  busy: boolean;
}

export function EventLog({ entries, busy }: Props) {
  const { t, lang } = useTranslation();
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length, busy]);

  const isEmpty = entries.length === 0 && !busy;

  return (
    <div className="flex flex-col">
      <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
        {t("flow.log_title")}
      </h4>

      {isEmpty ? (
        <div className="text-xs text-zinc-400 py-6 text-center border border-dashed border-zinc-200 rounded-md">
          <p className="font-medium text-zinc-500">{t("flow.log_empty")}</p>
          <p className="mt-1 text-zinc-400 leading-relaxed px-4">
            {t("flow.log_hint")}
          </p>
        </div>
      ) : (
        <ol
          ref={listRef}
          className="flex flex-col gap-0.5 text-xs max-h-56 overflow-y-auto pr-1"
        >
          {entries.map((entry, idx) => (
            <LogRow key={`${entry.node}-${idx}`} entry={entry} lang={lang} />
          ))}
          {busy && (
            <li className="flex items-center gap-2 py-1.5 px-2 rounded-md text-accent-700 bg-accent-50">
              <Spinner />
              <span className="text-[11px] italic">{t("flow.log_busy")}</span>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}

const NODE_LABEL: Record<"zh" | "en", Record<string, string>> = {
  zh: {
    generate_question: "出题",
    await_answer: "等候作答",
    evaluate_answer: "判题",
    give_hint: "给出提示",
    finalize_question: "本题收尾",
    update_progress: "更新进度",
  },
  en: {
    generate_question: "Generate",
    await_answer: "Await",
    evaluate_answer: "Evaluate",
    give_hint: "Hint",
    finalize_question: "Finalize",
    update_progress: "Progress",
  },
};

function LogRow({ entry, lang }: { entry: NodeLogEntry; lang: "zh" | "en" }) {
  const label = NODE_LABEL[lang][entry.node];

  return (
    <li className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-zinc-50 transition-colors">
      <span className="shrink-0 text-xs text-zinc-400" aria-hidden>
        ·
      </span>
      <span className="flex-1 truncate font-mono text-[11px] text-zinc-600">
        {entry.node}
        {label && <span className="text-zinc-400 ml-1.5">{label}</span>}
      </span>
    </li>
  );
}

function Spinner() {
  return (
    <span
      className="w-3 h-3 rounded-full border-2 border-accent-500 border-t-transparent animate-spin shrink-0"
      aria-hidden
    />
  );
}
