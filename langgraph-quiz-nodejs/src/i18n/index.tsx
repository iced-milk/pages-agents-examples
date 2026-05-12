import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import zh from "./zh";
import en from "./en";

export type Lang = "zh" | "en";

const dicts: Record<Lang, unknown> = { zh, en };

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LangContext = createContext<LangCtx>({
  lang: "zh",
  setLang: () => {},
});

function detectInitialLang(): Lang {
  if (typeof navigator === "undefined") return "zh";
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(detectInitialLang());
  const value = useMemo(() => ({ lang, setLang }), [lang]);
  return (
    <LangContext.Provider value={value}>{children}</LangContext.Provider>
  );
}

function getByPath(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(template: string, params: Record<string, string | number>) {
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) =>
    key in params ? String(params[key]) : `{{${key}}}`
  );
}

export function useTranslation() {
  const { lang, setLang } = useContext(LangContext);
  const t = (key: string, params?: Record<string, string | number>) => {
    const raw = getByPath(dicts[lang], key) ?? key;
    return params ? interpolate(raw, params) : raw;
  };
  return { t, lang, setLang };
}
