import { useCallback, useRef, useState } from 'react';
import type { SSEEvent } from '../types';

// ── localStorage history management ──

const HISTORY_KEY = 'crewai-planner-history';

export interface HistoryItem {
  id: string;
  productName: string;
  timestamp: number;
}

export function getHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHistory(id: string, productName: string) {
  const list = getHistory();
  if (list.find((h) => h.id === id)) return;
  list.unshift({ id, productName: productName.slice(0, 50), timestamp: Date.now() });
  if (list.length > 20) list.pop();
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

export function removeHistory(id: string) {
  const list = getHistory().filter((h) => h.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

// ── Hook ──

export function useSSE() {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string>('');

  /**
   * Send one user message — either the product name (first turn) or any
   * follow-up. The server determines phase from stored history.
   */
  const send = useCallback(async (
    userMessage: string,
    locale: string,
    options?: { isFirstTurn?: boolean },
  ) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // First turn: generate a fresh conversationId, save to localStorage / URL.
    if (options?.isFirstTurn) {
      const conversationId = crypto.randomUUID();
      conversationIdRef.current = conversationId;
      saveHistory(conversationId, userMessage);
      window.history.replaceState(null, '', '?id=' + conversationId);
    }

    const cid = conversationIdRef.current;

    try {
      const res = await fetch('/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'makers-conversation-id': cid,
        },
        body: JSON.stringify({
          action: 'send',
          user_message: userMessage,
          locale,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const event: SSEEvent = JSON.parse(trimmed.slice(6));
            setEvents((prev) => [...prev, event]);

            if (event.type === 'done') {
              return;
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      // AbortError is expected when a new request cancels the previous one
    }
  }, []);

  // Returns raw stored messages: { role, content, metadata }
  const loadHistory = useCallback(async (
    targetId: string,
  ): Promise<Array<{ role: string; content: string; metadata?: Record<string, unknown> | null }>> => {
    conversationIdRef.current = targetId;
    window.history.replaceState(null, '', '?id=' + targetId);

    try {
      const res = await fetch('/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'makers-conversation-id': targetId,
        },
        body: JSON.stringify({ action: 'history', conversationId: targetId }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.messages || [];
    } catch {
      return [];
    }
  }, []);

  const resetConversation = useCallback(() => {
    conversationIdRef.current = '';
    setEvents([]);
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  return {
    events,
    send,
    loadHistory,
    resetConversation,
  };
}
