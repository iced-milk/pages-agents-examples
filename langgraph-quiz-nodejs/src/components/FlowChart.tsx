import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { useTranslation } from "../i18n";
import type { NodeName } from "../types";

interface Props {
  currentNode: NodeName | string | null;
  completedNodes: Set<string>;
}

function toMermaidId(name: string): string {
  if (name === "START") return "__start__";
  if (name === "END") return "__end__";
  return name;
}

let mermaidInitialized = false;
function ensureMermaid() {
  if (mermaidInitialized) return;
  mermaidInitialized = true;

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 12,
    flowchart: {
      curve: "linear",
      htmlLabels: false,
      padding: 8,
      nodeSpacing: 28,
      rankSpacing: 40,
      useMaxWidth: true,
    },
    themeVariables: {
      fontSize: "12px",
      background: "#ffffff",
      primaryColor: "#ffffff",
      primaryBorderColor: "#e4e4e7",
      primaryTextColor: "#3f3f46",
      lineColor: "#a1a1aa",
      secondaryColor: "#fafafa",
      tertiaryColor: "#ffffff",
      nodeBorder: "#e4e4e7",
      clusterBkg: "#ffffff",
      clusterBorder: "#e4e4e7",
      edgeLabelBackground: "#ffffff",
      mainBkg: "#ffffff",
    },
    theme: "base",
  });
}

export function FlowChart({ currentNode, completedNodes }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [svgReady, setSvgReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch mermaid source from backend
  useEffect(() => {
    let cancelled = false;
    fetch("/quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "graph" }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`graph fetch failed: ${r.status}`);
        return r.json() as Promise<{ mermaid: string }>;
      })
      .then((d) => {
        if (!cancelled) setSource(d.mermaid);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Render mermaid to SVG
  useEffect(() => {
    if (!source || !containerRef.current) return;
    ensureMermaid();

    const id = `quiz-flow-${Math.random().toString(36).slice(2, 8)}`;
    let cancelled = false;

    setSvgReady(false);
    mermaid
      .render(id, source)
      .then(({ svg, bindFunctions }) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
        bindFunctions?.(containerRef.current);

        const svgEl = containerRef.current.querySelector("svg");
        if (svgEl) {
          svgEl.removeAttribute("width");
          svgEl.removeAttribute("height");
          svgEl.style.width = "100%";
          svgEl.style.height = "auto";
          svgEl.style.maxHeight = "520px";
        }
        setSvgReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message ?? e));
      });

    return () => {
      cancelled = true;
    };
  }, [source]);

  // Toggle is-active / is-done classes on nodes
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !svgReady) return;

    root.querySelectorAll<SVGGElement>("g.node").forEach((g) => {
      g.classList.remove("is-active", "is-done");
    });

    completedNodes.forEach((name) => {
      const id = toMermaidId(name);
      const el = root.querySelector<SVGGElement>(
        `g.node[id*="-flowchart-${CSS.escape(id)}-"]`
      );
      el?.classList.add("is-done");
    });

    if (currentNode) {
      const id = toMermaidId(currentNode);
      const el = root.querySelector<SVGGElement>(
        `g.node[id*="-flowchart-${CSS.escape(id)}-"]`
      );
      if (el) {
        el.classList.remove("is-done");
        el.classList.add("is-active");
      }
    }
  }, [currentNode, completedNodes, svgReady]);

  return (
    <div className="flex flex-col">
      <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
        {t("flow.title")}
      </h3>

      {!svgReady && !error && (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-400 min-h-[260px]">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>{t("flow.loading")}</span>
        </div>
      )}

      <div
        ref={containerRef}
        className="quiz-flow w-full"
        aria-label={t("flow.title")}
        role="img"
      />

      {error && (
        <p className="mt-2 text-xs text-red-600 font-mono break-all">{error}</p>
      )}
    </div>
  );
}
