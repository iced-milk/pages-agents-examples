import { useCallback, useRef, useState } from 'react';
import type { SSEEvent } from '../types';

type SSEStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error';

export function useSSE() {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [status, setStatus] = useState<SSEStatus>('idle');
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string>('');

  const start = useCallback(async (productName: string, locale?: string) => {
    // Reset
    setEvents([]);
    setStatus('connecting');

    // Abort previous if any
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Generate new conversationId for each task
    const conversationId = crypto.randomUUID();
    conversationIdRef.current = conversationId;

    try {
      const res = await fetch('/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'pages-agent-conversation-id': conversationId,
        },
        body: JSON.stringify({ product_name: productName, locale: locale || 'English' }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setStatus('error');
        return;
      }

      setStatus('streaming');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines: "data: {...}\n\n"
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const event: SSEEvent = JSON.parse(trimmed.slice(6));
            setEvents((prev) => [...prev, event]);

            if (event.type === 'done') {
              setStatus(event.status === 'completed' ? 'done' : 'error');
              return;
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      // Stream ended without done event
      setStatus('done');
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setStatus('error');
      }
    }
  }, []);

  return { events, status, start };
}
