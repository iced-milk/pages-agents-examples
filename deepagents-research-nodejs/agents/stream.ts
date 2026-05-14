/**
 * Deep Research Agent — EdgeOne Pages handler.
 *
 * Lead Researcher + Expert Researcher architecture:
 * - Lead Researcher breaks user questions into sub-questions
 * - Delegates each to an Expert Researcher (subagent with internet_search tool)
 * - Synthesizes a concise answer from all sub-results
 *
 * Stream design follows the official Deep Agents streaming guide
 *   https://docs.langchain.com/oss/javascript/deepagents/streaming
 *
 * We use `streamMode: ["updates", "messages"]` with `subgraphs: true`:
 *
 * - "updates"  → authoritative source for lifecycle / tool events.
 *     The aggregated AIMessage in the `model_request` node already
 *     contains complete `tool_calls` (real id, name, parsed args) and
 *     ToolMessages in the `tools` node carry the inner tool_call_id.
 *     This is far more reliable than reassembling from per-chunk
 *     `tool_call_chunks` in the messages stream.
 *
 * - "messages" → only used for streaming assistant *text* tokens.
 *
 * Emitted SSE events (intentionally minimal):
 *   ┌─────────────────────┬─────────────────────────────────────────┐
 *   │ subagent_pending    │ main agent issued a `task` tool call    │
 *   │ subagent_step       │ subagent entered a node                 │
 *   │ tool_call           │ subagent invoked a tool (name + args)   │
 *   │ tool                │ subagent's tool finished (no body)      │
 *   │ subagent_complete   │ task ToolMessage returned to main agent │
 *   │ ai                  │ assistant text token                    │
 *   │ error               │ stream error                            │
 *   └─────────────────────┴─────────────────────────────────────────┘
 */

import { initChatModel, tool } from 'langchain';
import {
  modelRetryMiddleware,
  modelCallLimitMiddleware,
  toolRetryMiddleware,
  toolCallLimitMiddleware,
} from 'langchain';
import { createDeepAgent, CompositeBackend, StateBackend, StoreBackend, type SubAgent } from 'deepagents';
import { AIMessageChunk, ToolMessage } from '@langchain/core/messages';
import { DDGS, type SearchResult } from '@phukon/duckduckgo-search';
import { z } from 'zod';

type Model = Awaited<ReturnType<typeof initChatModel>>;
type Agent = ReturnType<typeof createDeepAgent>;

interface Env {
  AI_GATEWAY_API_KEY: string;
  AI_GATEWAY_BASE_URL: string;
}

import { createLogger } from './_logger';

const logger = createLogger('research-stream');

// ─── Singleton model & agent (lazy init) ───

let model: Model | null = null;
let agent: Agent | null = null;

function getEnv(contextEnv: Record<string, string | undefined> | undefined): Env {
  const source = contextEnv ?? {};
  const required = ['AI_GATEWAY_API_KEY', 'AI_GATEWAY_BASE_URL'] as const;
  const missing = required.filter((k) => !source[k]?.trim());

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  return {
    AI_GATEWAY_API_KEY: source.AI_GATEWAY_API_KEY!,
    AI_GATEWAY_BASE_URL: source.AI_GATEWAY_BASE_URL!,
  };
}

async function getModel(env: Env): Promise<Model> {
  if (!model) {
    logger.log('Initializing model...');
    model = await initChatModel('@Pages/hy3-preview', {
      modelProvider: 'openai',
      apiKey: env.AI_GATEWAY_API_KEY,
      configuration: {
        baseURL: env.AI_GATEWAY_BASE_URL,
        defaultHeaders: {
          'X-Gateway-Quota-Bypass': 'true',
        },
      },
      temperature: 0,
      timeout: 300_000,
    });
  } else {
    logger.log('Model already initialized, reusing');
  }
  return model;
}

function getAgent(modelInstance: Model, checkpointer: any, store: any): Agent {
  if (!agent) {
    logger.log('Initializing research agent...');

    const today = new Date().toISOString().slice(0, 10);

    const ddgs = new DDGS({ timeout: 15000 });

    const internetSearch = tool(
      async ({ query, maxResults = 3 }: { query: string; maxResults?: number }) => {
        const results: SearchResult[] = await ddgs.text({
          keywords: query,
          maxResults,
        });
        if (!results || results.length === 0) {
          return 'No search results found.';
        }
        return results
          .map((r, i) => `[${i + 1}] ${r.title}\n${r.href}\n${r.body ?? ''}`)
          .join('\n\n');
      },
      {
        name: 'internet_search',
        description:
          'Search the internet using DuckDuckGo. Returns titles, URLs, and snippets for the given query.',
        schema: z.object({
          query: z.string().describe('The search query'),
          maxResults: z
            .number()
            .optional()
            .default(3)
            .describe('Maximum number of results to return'),
        }),
      }
    );

    const researcherSubagent: SubAgent = {
      name: 'researcher',
      description:
        'An expert researcher that answers a specific sub-question using web search.',
      systemPrompt:
        `You are an expert researcher. ` +
        `Today's date is ${today}. ` +
        `Use \`internet_search\` to find relevant, up-to-date information. ` +
        `Return only a concise summary of your findings with source URLs. ` +
        `Do not include raw search results or detailed tool outputs. ` +
        `Do not create or edit files — return your findings directly. ` +
        `IMPORTANT: Always respond in the same language as the task description you received. ` +
        `If the task is in Chinese, respond in Chinese. If in English, respond in English.`,
      tools: [internetSearch],
      middleware: [
        modelRetryMiddleware({ maxRetries: 3 }),
        modelCallLimitMiddleware({ runLimit: 30 }),
        toolRetryMiddleware({ maxRetries: 2, tools: ['internet_search'] }),
        toolCallLimitMiddleware({
          toolName: 'internet_search',
          runLimit: 15,
        }),
      ],
    };

    // Note: modelCallLimitMiddleware is NOT used at the top level because it
    // conflicts with parallel subagent execution (concurrent writes to the
    // threadModelCallCount channel).
    agent = createDeepAgent({
      model: modelInstance,
      systemPrompt:
        `You are a lead researcher. ` +
        `Today's date is ${today}. ` +
        `When the user asks a question, first briefly explain your research plan, ` +
        `then break the question into focused sub-questions and delegate via subagents. ` +
        `IMPORTANT: Write the task description in the same language as the user's message. ` +
        `After all results return, synthesize a concise, well-structured answer. ` +
        `Only use information your sub-agents reported — do not fabricate. ` +
        `Cite sources when available. Always respond in the user's language.`,
      subagents: [researcherSubagent],
      middleware: [
        modelRetryMiddleware({ maxRetries: 3 }),
      ],
      checkpointer,
      store,
      backend: new CompositeBackend(
        new StateBackend(),
        {
          '/memories/': new StoreBackend({
            namespace: ['agent', 'memories'],
          }),
        },
      ),
      memory: ['/memories/AGENTS.md'],
    });
  } else {
    logger.log('Agent already initialized, reusing');
  }
  return agent;
}

// ─── SSE event shape ───

interface StreamEvent {
  type: string;
  source: 'main' | 'subagent';
  content?: string;
  /** Tool name (used by `tool_call`). */
  name?: string;
  /** Tool name (used by `tool` completion). */
  tool_name?: string;
  /** For subagent_*: the main agent's `task` tool_call_id (= card id).
   *  For tool_call/tool: the inner per-invocation tool_call_id. */
  tool_call_id?: string;
  subagent_type?: string;
  description?: string;
  /** Pregel task id of a running subagent (short-form). */
  subagent_id?: string;
  /** JSON-serialised tool arguments (for `tool_call`). */
  args?: string;
}

// ─── SSE event stream generator ───

async function* eventStream(
  agentInstance: Agent,
  message: string,
  conversationId: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  // ── id mapping ──
  //
  // The main agent's `task` tool_call_id (which the frontend uses as the card
  // id) is NOT the same as the subagent's pregel task id that appears in the
  // namespace as `tools:<pregelId>`. We have to associate them by arrival
  // order: when a new subagent namespace shows up, link it to the oldest
  // unmatched task tool_call_id. Same approach as the official lifecycle
  // example in the Deep Agents streaming guide.
  const toolCallToSubagent = new Map<string, string>();
  const subagentToToolCall = new Map<string, string>();
  const pendingToolCallIds: string[] = [];

  // Dedup sets (the same updates snapshot can arrive multiple times).
  const emittedToolCallIds = new Set<string>();
  const emittedToolResultIds = new Set<string>();
  // Used to resolve a tool name on the `tool` completion event when the
  // ToolMessage itself doesn't carry one.
  const toolCallIdToName = new Map<string, string>();

  function extractSubagentId(ns: string[]): string {
    // namespace[0] looks like "tools:<pregelId>". Keep it short for display.
    return ns[0]?.split(':').pop()?.slice(0, 8) ?? '';
  }

  function linkIds(toolCallId: string, subagentId: string): void {
    if (!toolCallId || !subagentId) return;
    toolCallToSubagent.set(toolCallId, subagentId);
    subagentToToolCall.set(subagentId, toolCallId);
    const idx = pendingToolCallIds.indexOf(toolCallId);
    if (idx !== -1) pendingToolCallIds.splice(idx, 1);
  }

  function resolveBothIds(
    toolCallId = '',
    subagentId = '',
  ): [string, string] {
    if (subagentId && !toolCallId) {
      toolCallId = subagentToToolCall.get(subagentId) ?? '';
    }
    if (toolCallId && !subagentId) {
      subagentId = toolCallToSubagent.get(toolCallId) ?? '';
    }
    return [toolCallId, subagentId];
  }

  function send(event: StreamEvent): string {
    return `data: ${JSON.stringify(event)}\n\n`;
  }

  try {
    const stream = await agentInstance.stream(
      { messages: [{ role: 'user', content: message }] },
      {
        configurable: { thread_id: conversationId },
        streamMode: ['updates', 'messages'],
        subgraphs: true,
        signal,
      } as any,
    );

    for await (const tuple of stream) {
      if (signal?.aborted) break;

      const [chunkNs, chunkType, chunkData] = tuple as any as [
        string[],
        string,
        any,
      ];

      const isSubagent = chunkNs.some((s: string) => s.startsWith('tools:'));

      // ── "updates" mode: lifecycle + tool events ──
      if (chunkType === 'updates') {
        const data: Record<string, any> = chunkData ?? {};

        for (const [nodeName, nodeData] of Object.entries(data)) {
          // (A) Main agent's model_request emitted `task` tool_calls
          //     → a subagent has been spawned (pending).
          if (!isSubagent && nodeName === 'model_request') {
            const messages = (nodeData as any)?.messages ?? [];
            for (const msg of messages) {
              for (const tc of msg?.tool_calls ?? []) {
                if (tc.name !== 'task') continue;
                pendingToolCallIds.push(tc.id);
                yield send({
                  type: 'subagent_pending',
                  source: 'main',
                  tool_call_id: tc.id,
                  subagent_type: tc.args?.subagent_type ?? 'researcher',
                  description: (tc.args?.description ?? '').slice(0, 500),
                });
              }
            }
          }

          // (B) Any event under a subagent namespace → it's running.
          if (isSubagent) {
            let saId = extractSubagentId(chunkNs);

            // First time we see this subagent — link it to the oldest pending
            // task tool_call_id by arrival order.
            if (
              saId &&
              !subagentToToolCall.has(saId) &&
              pendingToolCallIds.length > 0
            ) {
              linkIds(pendingToolCallIds[0], saId);
            }

            let tcId: string;
            [tcId, saId] = resolveBothIds('', saId);

            yield send({
              type: 'subagent_step',
              source: 'subagent',
              subagent_id: saId,
              ...(tcId && { tool_call_id: tcId }),
            });

            // (B1) Aggregated AIMessage.tool_calls — one event per tool
            //      invocation, with full name + args + real id. This is the
            //      single source of truth for tool invocations.
            if (nodeName === 'model_request') {
              const stateMessages = (nodeData as any)?.messages ?? [];
              for (const msg of stateMessages) {
                for (const tc of (msg as any)?.tool_calls ?? []) {
                  const tcRealId: string = tc?.id ?? '';
                  if (!tc?.name) continue;
                  if (tcRealId && emittedToolCallIds.has(tcRealId)) continue;
                  if (tcRealId) {
                    emittedToolCallIds.add(tcRealId);
                    toolCallIdToName.set(tcRealId, tc.name);
                  }

                  const argsStr =
                    typeof tc.args === 'string'
                      ? tc.args
                      : tc.args != null
                        ? JSON.stringify(tc.args)
                        : '';

                  yield send({
                    type: 'tool_call',
                    source: 'subagent',
                    name: tc.name,
                    subagent_id: saId,
                    ...(tcRealId && { tool_call_id: tcRealId }),
                    ...(argsStr && { args: argsStr }),
                  });
                }
              }
            }

            // (B2) ToolMessage — flip the chip to "completed". No body.
            if (nodeName === 'tools') {
              const stateMessages = (nodeData as any)?.messages ?? [];
              for (const msg of stateMessages) {
                if (
                  !ToolMessage.isInstance(msg) &&
                  (msg as any)?.type !== 'tool'
                )
                  continue;

                const toolTcId: string = (msg as any).tool_call_id ?? '';
                const resolvedName: string =
                  msg.name ?? toolCallIdToName.get(toolTcId) ?? '';
                if (resolvedName === 'task') continue; // handled by (C)
                if (toolTcId && emittedToolResultIds.has(toolTcId)) continue;
                if (toolTcId) emittedToolResultIds.add(toolTcId);

                yield send({
                  type: 'tool',
                  source: 'subagent',
                  tool_name: resolvedName,
                  subagent_id: saId,
                  tool_call_id: toolTcId,
                });
              }
            }
          }

          // (C) Main agent's tools node received a `task` ToolMessage
          //     → that subagent is complete.
          if (!isSubagent && nodeName === 'tools') {
            const messages = (nodeData as any)?.messages ?? [];
            for (const msg of messages) {
              if (msg.type !== 'tool' || msg.name !== 'task') continue;
              const [tcId, saId] = resolveBothIds(msg.tool_call_id ?? '', '');
              yield send({
                type: 'subagent_complete',
                source: 'main',
                tool_call_id: tcId,
                ...(saId && { subagent_id: saId }),
              });
            }
          }
        }

        continue;
      }

      // ── "messages" mode: stream assistant text tokens only ──
      // Tool-related chunks here are intentionally ignored: the per-chunk
      // ids upstream are unreliable, and `updates` already gave us
      // authoritative tool events.
      if (chunkType === 'messages') {
        const [msg] = chunkData;
        if (!AIMessageChunk.isInstance(msg)) continue;
        if (!msg.text || msg.tool_call_chunks?.length) continue;

        const content = msg.text.replace(/\n{3,}/g, '\n\n');
        if (!content) continue;

        let saId = '';
        let tcId = '';
        if (isSubagent) {
          saId = extractSubagentId(chunkNs);
          [tcId, saId] = resolveBothIds('', saId);
        }

        yield send({
          type: 'ai',
          source: isSubagent ? 'subagent' : 'main',
          content,
          ...(saId && { subagent_id: saId }),
          ...(tcId && { tool_call_id: tcId }),
        });
      }
    }
  } catch (e: unknown) {
    const error = e as Error;
    if (error.name === 'AbortError' || signal?.aborted) {
      logger.log('aborted by user');
    } else {
      logger.error('stream error:', error.message, error.stack);
      yield send({
        type: 'error',
        source: 'main',
        content: `Stream error: ${error.constructor.name}: ${String(error.message).slice(0, 200)}`,
      });
    }
  }

  yield 'data: [DONE]\n\n';
}

// ─── EdgeOne Pages handler ───

export async function onRequest(context: any) {
  const { request, env, conversation_id: conversationId, run_id: runId } = context;
  logger.log('conversationId:', conversationId, 'runId:', runId);

  const body = request?.body ?? {};
  const action = body.action || 'chat';

  const signal = request?.signal as AbortSignal | undefined;

  // Get memory adapters from context
  const checkpointer = context.memory.langgraphCheckpointer;
  const store = context.memory.langgraphStore;

  let agentInstance: Agent;
  try {
    const envVars = getEnv(env);
    const modelInstance = await getModel(envVars);
    agentInstance = getAgent(modelInstance, checkpointer, store);
  } catch (e) {
    const msg = (e as Error).message;
    logger.error(msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    });
  }

  // ── action: history — restore conversation from checkpointer ──
  if (action === 'history') {
    const threadId = body.conversationId;
    logger.log('history request for threadId:', threadId);
    if (!threadId) {
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      });
    }
    try {
      const state = await agentInstance.graph.getState({
        configurable: { thread_id: threadId },
      });
      const rawMessages = state?.values?.messages || [];

      // Build an ordered items array preserving the original conversation flow.
      // Each item has a type so the frontend can reconstruct messages + subagent groups.
      type HistoryItem =
        | { type: 'user'; content: string }
        | { type: 'coordinator'; content: string }
        | { type: 'subagentTask'; id: string; description: string; subagentType: string; content: string };

      const items: HistoryItem[] = [];

      // Map tool_call_id -> task info for matching ToolMessages later
      const pendingTasks = new Map<string, { description: string; subagentType: string }>();

      for (const m of rawMessages) {
        const msgType = typeof m._getType === 'function' ? m._getType() : m.type;

        if (msgType === 'human') {
          const content = typeof m.content === 'string' ? m.content : '';
          if (content) items.push({ type: 'user', content });
          continue;
        }

        if (msgType === 'ai') {
          let textContent = '';
          if (typeof m.content === 'string') {
            textContent = m.content;
          } else if (Array.isArray(m.content)) {
            textContent = m.content
              .filter((p: any) => p.type === 'text')
              .map((p: any) => p.text || '')
              .join('');
          }

          for (const tc of (m.tool_calls || [])) {
            if (tc.name === 'task' && tc.id) {
              pendingTasks.set(tc.id, {
                description: (tc.args?.description || '').slice(0, 500),
                subagentType: tc.args?.subagent_type || 'researcher',
              });
            }
          }

          if (textContent) items.push({ type: 'coordinator', content: textContent });
          continue;
        }

        if (msgType === 'tool') {
          const toolCallId = m.tool_call_id || '';
          if (m.name === 'task' && pendingTasks.has(toolCallId)) {
            const taskInfo = pendingTasks.get(toolCallId)!;
            items.push({
              type: 'subagentTask',
              id: toolCallId,
              description: taskInfo.description,
              subagentType: taskInfo.subagentType,
              content: typeof m.content === 'string' ? m.content : '',
            });
            pendingTasks.delete(toolCallId);
          }
          continue;
        }
      }

      logger.log('history: found', items.length, 'items');
      return new Response(JSON.stringify({ items }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      });
    } catch (e) {
      logger.error('history error:', (e as Error).message);
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      });
    }
  }

  // ── action: chat (default) — normal SSE streaming ──
  const { message } = body;
  logger.log('user message:', message);
  if (!message) {
    logger.error('Missing chat message');
    return new Response('Missing chat message', { status: 400 });
  }

  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of eventStream(agentInstance, message, conversationId, signal)) {
          if (signal?.aborted) break;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e) {
        const error = e as Error;
        if (error.name === 'AbortError' || signal?.aborted) return;
        const errorEvent = `data: ${JSON.stringify({ type: 'error', source: 'main', content: error.message })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
      } finally {
        controller.close();
      }
    },
    cancel() {
      logger.log('client disconnected');
    },
  });

  return new Response(readableStream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
