/**
 * useAgentStream — SSE streaming hook for the DeepAgents chat.
 *
 * Consumes the EdgeOne Pages SSE endpoint (POST /stream) and manages:
 * - messages[]       : the linear chat history
 * - subAgentGroups[] : batches of SubAgent cards, each triggered by a coordinator message
 * - phase            : current research phase (idle -> planning -> researching -> synthesizing -> complete)
 * - isStreaming       : whether the stream is active
 *
 * ConversationId is managed here: generated once per session, sent via
 * `pages-agent-conversation-id` header so EdgeOne routes to the same agent instance.
 */

import { useCallback, useRef, useState } from "react";
import type {
  ChatMessage,
  FlowItem,
  ResearchPhase,
  StreamEvent,
  SubAgentGroup,
  SubAgentTask,
  ToolCallEntry,
} from "../lib/types";

// -- Helpers --

let _id = 0;
function uid(): string {
  return `msg-${++_id}-${Date.now()}`;
}

function toolCallUid(): string {
  return `tc-${++_id}-${Date.now()}`;
}

// -- Build a short, human-readable summary from tool args --
//
// Tries JSON.parse on the accumulated args string; if successful, picks a
// reasonable display field per known tool, with a generic fallback that
// works for any unknown tool (built-in or custom).
function buildArgSummary(toolName: string, rawArgs: string): string | undefined {
  if (!rawArgs) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const args = parsed as Record<string, unknown>;

  const truncate = (s: string, n = 80) =>
    s.length > n ? s.slice(0, n - 1) + "…" : s;

  switch (toolName) {
    case "internet_search": {
      const q = typeof args.query === "string" ? args.query : "";
      return q ? `"${truncate(q)}"` : undefined;
    }
    case "write_todos": {
      const todos = args.todos;
      if (Array.isArray(todos)) return `${todos.length} todos`;
      return undefined;
    }
    case "read_file":
    case "read":
    case "write_file":
    case "edit_file": {
      const p =
        (typeof args.file_path === "string" && args.file_path) ||
        (typeof args.path === "string" && args.path) ||
        "";
      return p ? truncate(p) : undefined;
    }
    case "ls": {
      const p = typeof args.path === "string" ? args.path : "/";
      return truncate(p);
    }
    default: {
      // Generic fallback: first string value in args
      for (const v of Object.values(args)) {
        if (typeof v === "string" && v.trim()) return `"${truncate(v)}"`;
      }
      return undefined;
    }
  }
}

// Global order counter for timeline rendering
let _orderIdx = 0;
function nextOrder(): number {
  return ++_orderIdx;
}

// -- Hook --

export function useAgentStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [subAgentGroups, setSubAgentGroups] = useState<SubAgentGroup[]>([]);
  const [phase, setPhase] = useState<ResearchPhase>("idle");
  const [isStreaming, setIsStreaming] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const wasCancelledRef = useRef(false);

  // ConversationId: generated once, fixed for the entire session.
  // Reset on new chat to start a fresh conversation.
  const conversationIdRef = useRef<string>(crypto.randomUUID());

  // Bidirectional mapping: subagent_id <-> card_id (tool_call_id)
  const saToCardRef = useRef<Map<string, string>>(new Map());
  const cardToGroupRef = useRef<Map<string, string>>(new Map());

  // -- Resolve which card a subagent event belongs to --
  //
  // IMPORTANT: there are two different `tool_call_id` namespaces in play:
  //   1. The MAIN agent's `task` tool_call_id — this IS the card id
  //      (used as `SubAgentTask.id`). Lifecycle events (subagent_pending /
  //      _step / _complete) carry this id.
  //   2. The SUBAGENT's internal tool_call_id (e.g. for `internet_search`,
  //      `write_todos`, ...). This is NOT a card id; it identifies a single
  //      tool invocation inside the subagent and must NEVER be treated as
  //      the card id, otherwise `updateTask` will silently miss every event
  //      and tool chips will disappear.
  //
  // So:
  //   - lifecycle events  -> resolveCardId({ preferToolCallId: true })
  //   - subagent tool/AI  -> resolveCardId({ preferToolCallId: false })
  //                          (resolve via subagent_id mapping only)

  function resolveCardId(
    event: StreamEvent,
    opts: { preferToolCallId?: boolean } = {}
  ): string | null {
    if (opts.preferToolCallId && event.tool_call_id) return event.tool_call_id;
    if (event.subagent_id) {
      const mapped = saToCardRef.current.get(event.subagent_id);
      if (mapped) return mapped;
    }
    return null;
  }

  // -- Update a specific task card --

  function updateTask(
    cardId: string,
    updater: (task: SubAgentTask) => SubAgentTask
  ) {
    setSubAgentGroups((prev) =>
      prev.map((group) => ({
        ...group,
        tasks: group.tasks.map((task) =>
          task.id === cardId ? updater(task) : task
        ),
      }))
    );
  }

  // -- Build flow items for rendering (pure timeline order) --

  function buildFlowItems(): FlowItem[] {
    // Collect all items with their order index
    const ordered: { orderIdx: number; item: FlowItem }[] = [];

    for (const msg of messages) {
      ordered.push({
        orderIdx: msg.orderIdx ?? 0,
        item: msg.role === "user"
          ? { type: "user_message", message: msg }
          : { type: "ai_message", message: msg },
      });
    }

    for (const group of subAgentGroups) {
      ordered.push({
        orderIdx: group.orderIdx ?? 0,
        item: { type: "subagent_group", group },
      });
    }

    // Sort by creation order
    ordered.sort((a, b) => a.orderIdx - b.orderIdx);

    return ordered.map((o) => o.item);
  }

  // -- Send message --

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: text,
        orderIdx: nextOrder(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setPhase("planning");
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      wasCancelledRef.current = false;

      saToCardRef.current.clear();
      cardToGroupRef.current.clear();

      let currentAssistantId: string | null = null;
      let synthesisAssistantId: string | null = null;
      let synthesisStarted = false;
      let currentGroupId: string | null = null;
      let lastGroupLinkedToMsgId: string | null = null;
      let hasSeenSubAgents = false;
      const unmappedCardIds: string[] = [];

      // -- Event handlers --

      function handleSubagentPending(event: StreamEvent) {
        const cardId = event.tool_call_id || uid();
        const description = event.description || "";
        const subagentType = event.subagent_type || "researcher";

        if (synthesisStarted) {
          synthesisStarted = false;
          synthesisAssistantId = null;
        }

        hasSeenSubAgents = true;
        setPhase("researching");

        if (currentAssistantId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentAssistantId
                ? { ...m, hasSubAgents: true }
                : m
            )
          );
        }

        const newTask: SubAgentTask = {
          id: cardId,
          description,
          status: "pending",
          content: "",
          toolCalls: [],
          startedAt: Date.now(),
          subagentType,
        };

        unmappedCardIds.push(cardId);

        if (!currentGroupId || currentAssistantId !== lastGroupLinkedToMsgId) {
          currentGroupId = `group-${++_id}`;
          lastGroupLinkedToMsgId = currentAssistantId;
          const triggerMsgId = currentAssistantId || undefined;
          setSubAgentGroups((prev) => [
            ...prev,
            { id: currentGroupId!, tasks: [newTask], triggeredByMessageId: triggerMsgId, orderIdx: nextOrder() },
          ]);
        } else {
          setSubAgentGroups((prev) =>
            prev.map((g) =>
              g.id === currentGroupId
                ? { ...g, tasks: [...g.tasks, newTask] }
                : g
            )
          );
        }

        cardToGroupRef.current.set(cardId, currentGroupId);
      }

      function handleSubagentStep(event: StreamEvent) {
        const saId = event.subagent_id || "";

        if (saId && !saToCardRef.current.has(saId) && unmappedCardIds.length > 0) {
          const cardId = unmappedCardIds.shift()!;
          saToCardRef.current.set(saId, cardId);
        }

        const cardId = resolveCardId(event, { preferToolCallId: true });
        if (cardId) {
          updateTask(cardId, (t) =>
            t.status === "pending"
              ? { ...t, status: "running", startedAt: Date.now() }
              : t
          );
        }
      }

      function handleSubagentComplete(event: StreamEvent) {
        const cardId = resolveCardId(event, { preferToolCallId: true });
        if (cardId) {
          updateTask(cardId, (t) => ({
            ...t,
            status: "complete",
            duration: (Date.now() - t.startedAt) / 1000,
            toolCalls: t.toolCalls.map((tc) => ({
              ...tc,
              status: "completed" as const,
            })),
          }));
        }

        setSubAgentGroups((prev) => {
          const allComplete = prev.every((g) =>
            g.tasks.every((t) => {
              if (t.id === cardId) return true;
              return t.status === "complete";
            })
          );
          if (allComplete && hasSeenSubAgents) {
            synthesisStarted = true;
            setPhase("synthesizing");
          }
          return prev;
        });
      }

      function handleMainAI(event: StreamEvent) {
        const content = event.content || "";
        if (!content) return;

        if (hasSeenSubAgents && synthesisStarted) {
          if (!synthesisAssistantId) {
            const newId = uid();
            synthesisAssistantId = newId;
            currentAssistantId = newId;
            currentGroupId = null;
            setMessages((prev) => [
              ...prev,
              { id: newId, role: "assistant", content, orderIdx: nextOrder() },
            ]);
          } else {
            const targetId = synthesisAssistantId;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === targetId
                  ? { ...m, content: m.content + content }
                  : m
              )
            );
          }
          return;
        }

        if (hasSeenSubAgents && currentAssistantId) {
          const newId = uid();
          currentAssistantId = newId;
          currentGroupId = null;
          setMessages((prev) => [
            ...prev,
            { id: newId, role: "assistant", content, orderIdx: nextOrder() },
          ]);
          return;
        }

        if (!currentAssistantId) {
          const newId = uid();
          currentAssistantId = newId;
          setMessages((prev) => [
            ...prev,
            { id: newId, role: "assistant", content, orderIdx: nextOrder() },
          ]);
        } else {
          const targetId = currentAssistantId;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetId
                ? { ...m, content: m.content + content }
                : m
            )
          );
        }
      }

      function handleMainToolCall(event: StreamEvent) {
        if (event.name === "task") {
          hasSeenSubAgents = true;
          setPhase("researching");
        }
      }

      function handleSubagentAI(event: StreamEvent) {
        // AI text from subagent: never use tool_call_id (which here would be
        // the subagent's internal tool id) — resolve via subagent_id only.
        const cardId = resolveCardId(event, { preferToolCallId: false });
        const content = event.content || "";
        if (!cardId || !content) return;

        updateTask(cardId, (t) => ({
          ...t,
          content: t.content + content,
          status: t.status === "pending" ? "running" : t.status,
        }));
      }

      function handleSubagentToolCall(event: StreamEvent) {
        // The backend now emits one `tool_call` event per real tool
        // invocation, with complete `name` and `args` already aggregated.
        // No streaming/merge logic needed — just push a new entry.
        // `tool_call_id` here is the inner per-invocation id (NOT the card
        // id), so the card must be resolved via subagent_id.
        const cardId = resolveCardId(event, { preferToolCallId: false });
        if (!cardId) return;

        const tcId = event.tool_call_id;
        const name = event.name;
        if (!name) return;

        const args = event.args ?? "";
        // Namespace the entry id so it never collides with a card id.
        const entryId = tcId ? `tc:${tcId}` : toolCallUid();

        updateTask(cardId, (t) => {
          // Idempotent: if we somehow receive the same tool_call_id twice,
          // don't duplicate the entry.
          if (tcId && t.toolCalls.some((tc) => tc.id === entryId)) return t;

          const entry: ToolCallEntry = {
            id: entryId,
            name,
            status: "pending",
            args: args || undefined,
            argSummary: args ? buildArgSummary(name, args) : undefined,
          };
          return {
            ...t,
            toolCalls: [...t.toolCalls, entry],
            status: t.status === "pending" ? "running" : t.status,
          };
        });
      }

      function handleSubagentToolResult(event: StreamEvent) {
        const cardId = resolveCardId(event, { preferToolCallId: false });
        if (!cardId) return;
        const tcId = event.tool_call_id;
        const entryId = tcId ? `tc:${tcId}` : null;

        updateTask(cardId, (t) => {
          const toolCalls = [...t.toolCalls];
          // Prefer exact tool_call_id match; fall back to first pending.
          let idx = entryId
            ? toolCalls.findIndex((tc) => tc.id === entryId)
            : -1;
          if (idx === -1) {
            idx = toolCalls.findIndex((tc) => tc.status === "pending");
          }
          if (idx !== -1) {
            toolCalls[idx] = {
              ...toolCalls[idx],
              status: "completed",
            };
          }
          return { ...t, toolCalls };
        });
      }

      // -- SSE stream consumption --

      try {
        const resp = await fetch("/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "pages-agent-conversation-id": conversationIdRef.current,
          },
          body: JSON.stringify({ message: text }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }

        const reader = resp.body?.getReader();
        if (!reader) throw new Error("No readable stream");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            const payload = trimmed.slice(6);
            if (payload === "[DONE]") continue;

            let event: StreamEvent;
            try {
              event = JSON.parse(payload);
            } catch {
              continue;
            }

            switch (event.type) {
              case "subagent_pending":
                handleSubagentPending(event);
                break;
              case "subagent_step":
                handleSubagentStep(event);
                break;
              case "subagent_complete":
                handleSubagentComplete(event);
                break;
              case "ai":
                if (event.source === "main") {
                  handleMainAI(event);
                } else {
                  handleSubagentAI(event);
                }
                break;
              case "tool_call":
                if (event.source === "main") {
                  handleMainToolCall(event);
                } else {
                  handleSubagentToolCall(event);
                }
                break;
              case "tool":
                if (event.source === "subagent") {
                  handleSubagentToolResult(event);
                }
                break;
              case "error":
                setMessages((prev) => [
                  ...prev,
                  {
                    id: uid(),
                    role: "assistant",
                    content: `⚠️ ${event.content || "Unknown error"}`,
                    orderIdx: nextOrder(),
                  },
                ]);
                break;
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          wasCancelledRef.current = true;
        } else {
          const errorMsg =
            err instanceof Error ? err.message : "Stream connection failed";
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              role: "assistant",
              content: `⚠️ ${errorMsg}`,
              orderIdx: nextOrder(),
            },
          ]);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;

        if (wasCancelledRef.current) {
          setPhase("idle");
          setMessages((prev) => [
            ...prev,
            { id: uid(), role: "assistant", content: "__STOPPED__", orderIdx: nextOrder() },
          ]);
          setSubAgentGroups((prev) =>
            prev.map((group) => ({
              ...group,
              tasks: group.tasks.map((task) =>
                task.status === "running" || task.status === "pending"
                  ? {
                      ...task,
                      status: "cancelled" as const,
                      duration:
                        task.duration || (Date.now() - task.startedAt) / 1000,
                    }
                  : task
              ),
            }))
          );
        } else {
          setPhase("complete");
          setSubAgentGroups((prev) =>
            prev.map((group) => ({
              ...group,
              tasks: group.tasks.map((task) =>
                task.status === "running" || task.status === "pending"
                  ? {
                      ...task,
                      status: "complete" as const,
                      duration:
                        task.duration || (Date.now() - task.startedAt) / 1000,
                    }
                  : task
              ),
            }))
          );
        }
      }
    },
    [isStreaming]
  );

  // -- Stop streaming --

  const stopStreaming = useCallback(async () => {
    wasCancelledRef.current = true;

    // Call the /stop endpoint to abort the active run on server side
    try {
      await fetch("/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "pages-agent-conversation-id": conversationIdRef.current,
        },
        body: JSON.stringify({ conversationId: conversationIdRef.current }),
      });
    } catch {
      // ignore stop request failure
    }

    abortRef.current?.abort();
  }, []);

  // -- Reset for new conversation --

  const resetChat = useCallback(() => {
    stopStreaming();
    setMessages([]);
    setSubAgentGroups([]);
    setPhase("idle");
    setIsStreaming(false);
    saToCardRef.current.clear();
    cardToGroupRef.current.clear();
    _orderIdx = 0;
    // Generate new conversationId for fresh conversation
    conversationIdRef.current = crypto.randomUUID();
  }, [stopStreaming]);

  return {
    messages,
    subAgentGroups,
    phase,
    isStreaming,
    sendMessage,
    stopStreaming,
    resetChat,
    buildFlowItems,
  };
}
