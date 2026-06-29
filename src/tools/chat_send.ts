/**
 * MCP tool: chat_send (spec §3.2) — P2 non-stream + P3 streaming.
 *
 * SDK 0.5 has no streaming tool-result API, so P3 incremental emission uses
 * MCP logging notifications (`notifications/message`) via the server's
 * `sendLoggingMessage`. The caller passes a `notify` callback wired to that
 * method; each Sakana stream event becomes a structured log line the client
 * can render incrementally. The final tool result still carries the full
 * `finalAnswer` so non-streaming clients get a complete answer.
 *
 * We never log the raw user message body (spec §5 Security). Stream tokens are
 * model output, not user PII; if REDACT_PII is on, redaction happens at the
 * guard layer (P4) — here we only relay.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { SessionManager } from "../sessions/manager.js";
import type { SakanaStreamEvent } from "../browser/stream-relay.js";

export const ChatSendInputSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
  enableThinking: z.boolean().default(false),
  webSearch: z.boolean().default(true),
  /** "abort" — interrupt an in-flight send (spec §3.2 signal). */
  signal: z.enum(["abort"]).optional(),
});

/** A log-line payload we emit as an MCP logging notification (P3 streaming). */
export type ChatStreamLogPayload =
  | { type: "token"; text: string }
  | { type: "status"; status: string }
  | { type: "title"; title: string }
  | { type: "final"; text: string; interrupted: boolean }
  | { type: "error"; code: string; message: string };

/** Map a Sakana stream event to the MCP logging payload shape. */
export function eventToLogPayload(
  e: SakanaStreamEvent
): ChatStreamLogPayload | null {
  switch (e.type) {
    case "stream":
      return { type: "token", text: e.token };
    case "status":
      return { type: "status", status: e.status };
    case "title":
      return { type: "title", title: e.title };
    case "finalAnswer":
      return { type: "final", text: e.text, interrupted: e.interrupted };
    case "error":
      return { type: "error", code: e.code, message: e.message };
    default:
      // createdMessage / unknown — not surfaced to the client stream.
      return null;
  }
}

export interface ChatSendToolDeps {
  /**
   * Emit an incremental stream event as an MCP logging notification.
   * Wired to `server.sendLoggingMessage` in index.ts. Optional: when absent
   * (e.g. unit tests), the tool still returns the final result.
   */
  notify?: (payload: ChatStreamLogPayload) => void;
  /** AbortSignal from the MCP request extra, if the client supports cancellation. */
  signal?: AbortSignal;
}

export const chatSendTool = {
  name: "chat_send",
  description:
    "Send a message to an open Sakana chat session and receive the streamed " +
    "reply. Incremental tokens are emitted as MCP logging notifications; the " +
    "tool result carries the final answer. Pass signal:\"abort\" to interrupt.",
  schema: ChatSendInputSchema,
  handler: async (
    manager: SessionManager,
    input: z.infer<typeof ChatSendInputSchema>,
    deps?: ChatSendToolDeps
  ) => {
    // signal:"abort" in the input is a one-shot interrupt request.
    if (input.signal === "abort") {
      const res = await manager.interrupt(input.sessionId);
      return JSON.stringify(
        { type: "final", text: res.partialText, interrupted: true },
        null,
        2
      );
    }

    const onEvent = (e: SakanaStreamEvent) => {
      const payload = eventToLogPayload(e);
      if (payload && deps?.notify) {
        try {
          deps.notify(payload);
        } catch {
          // notification failures must not break the stream
        }
      }
    };

    const { finalText, interrupted } = await manager.chatSend(
      input.sessionId,
      {
        message: input.message,
        enableThinking: input.enableThinking,
        webSearch: input.webSearch,
      },
      onEvent,
      deps?.signal
    );

    return JSON.stringify(
      { type: "final", text: finalText, interrupted, messageId: randomUUID() },
      null,
      2
    );
  },
};
