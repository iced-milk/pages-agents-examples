import { Command } from "@langchain/langgraph";
import { graph } from "./_lib/graph";
import { MAX_ATTEMPTS } from "./_lib/state";
import { createLogger } from "./_lib/logger";
import { initModels, type Env } from "./_lib/nodes";

const logger = createLogger("quiz");

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function getEnv(contextEnv: Record<string, string | undefined> | undefined): Env {
  const source = contextEnv ?? {};
  const required = ["AI_GATEWAY_API_KEY", "AI_GATEWAY_BASE_URL"] as const;
  const missing = required.filter((k) => !source[k]?.trim());
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
  return {
    AI_GATEWAY_API_KEY: source.AI_GATEWAY_API_KEY!,
    AI_GATEWAY_BASE_URL: source.AI_GATEWAY_BASE_URL!,
  };
}

async function streamGraph(
  payload: any,
  config: { configurable: { thread_id: string } },
  signal?: AbortSignal
): Promise<Response> {
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        const stream = await graph.stream(payload, {
          ...config,
          streamMode: ["updates", "custom", "messages"],
        });

        for await (const tuple of stream) {
          if (signal?.aborted) break;
          const [mode, chunk] = tuple as [string, unknown];

          if (mode === "updates") {
            const chunkObj = chunk as Record<string, unknown>;
            if ("__interrupt__" in chunkObj) {
              const interrupts = chunkObj["__interrupt__"] as Array<{
                value?: Record<string, unknown>;
              }>;
              const interruptValue = interrupts[0]?.value ?? {};
              controller.enqueue(encoder.encode(sse("waiting", interruptValue)));
              continue;
            }
            for (const nodeName of Object.keys(chunkObj)) {
              controller.enqueue(
                encoder.encode(sse("node", { node: nodeName, status: "active" }))
              );
            }
          } else if (mode === "custom") {
            const chunkObj = chunk as Record<string, unknown>;
            const eventName = (chunkObj.event as string) ?? "custom";
            const payloadOut: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(chunkObj)) {
              if (k !== "event") payloadOut[k] = v;
            }
            controller.enqueue(encoder.encode(sse(eventName, payloadOut)));
          } else if (mode === "messages") {
            const [messageChunk, metadata] = chunk as [
              { content?: string },
              { tags?: string[] }
            ];
            const tags = metadata?.tags ?? [];
            if (!tags.includes("hint")) continue;
            const delta = messageChunk?.content ?? "";
            if (!delta) continue;
            controller.enqueue(encoder.encode(sse("hint_token", { delta })));
          }
        }

        // Check if graph reached END
        const state = await graph.getState(config);
        if (!state.next || state.next.length === 0) {
          const finalValues = (state.values ?? {}) as Record<string, unknown>;
          const total = (finalValues.total_questions as number) || 0;
          const attempts = (finalValues.total_attempts as number) || 0;
          const avg = total ? Math.round((attempts / total) * 100) / 100 : 0;
          controller.enqueue(
            encoder.encode(
              sse("complete", {
                final_score: (finalValues.score as number) ?? 0,
                total,
                total_attempts: attempts,
                avg_attempts: avg,
              })
            )
          );
        }
      } catch (err) {
        if ((err as Error).name === "AbortError" || signal?.aborted) {
          logger.log("aborted by user");
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        logger.error("stream error:", message);
        controller.enqueue(encoder.encode(sse("error", { message })));
      } finally {
        controller.close();
      }
    },
    cancel() {
      logger.log("client disconnected");
    },
  });

  return new Response(readableStream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function handleStart(
  conversationId: string,
  payload: any,
  signal?: AbortSignal
): Promise<Response> {
  const { language = "zh", total_questions = 5 } = payload;

  if (!["zh", "en"].includes(language)) {
    return new Response(
      JSON.stringify({ detail: "language must be 'zh' or 'en'" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const config = { configurable: { thread_id: conversationId } };

  const initial = {
    language,
    total_questions,
    question_number: 0,
    score: 0,
    total_attempts: 0,
  };

  logger.log("start quiz, conversationId:", conversationId);

  // Prepend session event to the stream
  const encoder = new TextEncoder();
  const sessionFrame = sse("session", {
    thread_id: conversationId,
    max_attempts: MAX_ATTEMPTS,
  });

  const graphResponse = await streamGraph(initial, config, signal);
  const graphBody = graphResponse.body!;

  // Combine session event + graph stream
  const combinedStream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(sessionFrame));
      const reader = graphBody.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(combinedStream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function handleAnswer(
  conversationId: string,
  payload: any,
  signal?: AbortSignal
): Promise<Response> {
  const { answer } = payload;

  if (!answer) {
    return new Response(
      JSON.stringify({ detail: "answer is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!/^[A-Da-d]$/.test(answer)) {
    return new Response(
      JSON.stringify({ detail: "answer must be A, B, C, or D" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const config = { configurable: { thread_id: conversationId } };

  // Verify thread exists and is waiting
  try {
    const state = await graph.getState(config);
    if (!state.next || state.next.length === 0) {
      return new Response(
        JSON.stringify({ detail: "thread already finished" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ detail: "unknown thread" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const answerLetter = answer.trim().toUpperCase();

  logger.log("answer:", answerLetter, "conversationId:", conversationId);

  return streamGraph(new Command({ resume: answerLetter }), config, signal);
}

async function handleGraph(): Promise<Response> {
  const drawable = await graph.getGraphAsync();
  const mermaid = drawable.drawMermaid({ withStyles: false });
  return new Response(JSON.stringify({ mermaid }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function onRequest(context: any) {
  const { request, env, conversation_id: conversationId, run_id: runId } = context;
  logger.log("conversationId:", conversationId, "runId:", runId);

  const body = request?.body ?? {};
  const { action, ...payload } = body;

  if (!action) {
    return new Response(
      JSON.stringify({ detail: "action is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const signal = request?.signal as AbortSignal | undefined;

  try {
    initModels(getEnv(env));
  } catch (e) {
    const msg = (e as Error).message;
    logger.error(msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  switch (action) {
    case "start":
      return handleStart(conversationId, payload, signal);
    case "answer":
      return handleAnswer(conversationId, payload, signal);
    case "graph":
      return handleGraph();
    default:
      return new Response(
        JSON.stringify({ detail: `Unknown action: ${action}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
  }
}
