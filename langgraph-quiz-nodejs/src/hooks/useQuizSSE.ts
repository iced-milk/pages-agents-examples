import { useCallback, useRef } from "react";
import type { QuizEvent } from "../types";

export function useQuizSSE(onEvent: (ev: QuizEvent) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string>(
    new URLSearchParams(window.location.search).get('id') || crypto.randomUUID()
  );

  const run = useCallback(async (body: unknown) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let resp: Response;
    try {
      resp = await fetch("/quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "makers-conversation-id": conversationIdRef.current,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      handlerRef.current({
        type: "error",
        data: { message: (e as Error).message || "network error" },
      });
      return;
    }

    if (!resp.ok || !resp.body) {
      handlerRef.current({
        type: "error",
        data: { message: `HTTP ${resp.status}` },
      });
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          parseFrame(frame, (ev) => handlerRef.current(ev));
        }
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      handlerRef.current({
        type: "error",
        data: { message: (e as Error).message || "stream interrupted" },
      });
    }
  }, []);

  const start = useCallback(
    (language: "zh" | "en") => {
      window.history.replaceState(null, '', '?id=' + conversationIdRef.current);
      run({ action: "start", language });
    },
    [run]
  );

  const answer = useCallback(
    (choice: string) => run({ action: "answer", answer: choice }),
    [run]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resetConversation = useCallback(() => {
    conversationIdRef.current = crypto.randomUUID();
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const getConversationId = useCallback(() => {
    return conversationIdRef.current;
  }, []);

  const resume = useCallback(async (): Promise<any> => {
    const id = conversationIdRef.current;
    if (!id || !new URLSearchParams(window.location.search).get('id')) return null;
    try {
      const resp = await fetch("/quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "makers-conversation-id": id,
        },
        body: JSON.stringify({ action: "resume" }),
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch {
      return null;
    }
  }, []);

  return { start, answer, cancel, resetConversation, getConversationId, resume };
}

function parseFrame(frame: string, emit: (ev: QuizEvent) => void) {
  let event = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0) return;

  let data: unknown;
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    data = dataLines.join("\n");
  }

  emit({ type: event as QuizEvent["type"], data: data as never });
}
