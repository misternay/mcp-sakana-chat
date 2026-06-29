/**
 * Unit tests for chat_send tool (spec §3.2) and eventToLogPayload mapping.
 *
 * We mock SessionManager so no Playwright/network is required. The tests verify:
 *  - P2 non-stream: final result carries the finalAnswer text.
 *  - P3 streaming: each event is mapped to a log payload and passed to notify.
 *  - signal:"abort" short-circuits to an interrupted result.
 *  - eventToLogPayload drops createdMessage/unknown (not surfaced to client).
 */
import { describe, it, expect, vi } from "vitest";
import {
  chatSendTool,
  ChatSendInputSchema,
  eventToLogPayload,
  type ChatStreamLogPayload,
} from "../src/tools/chat_send.js";
import type { SessionManager } from "../src/sessions/manager.js";
import type { SakanaStreamEvent } from "../src/browser/stream-relay.js";

/** Build a mock SessionManager with stubbed chatSend/interrupt. */
function mockManager(opts: {
  finalText?: string;
  interrupted?: boolean;
  events?: SakanaStreamEvent[];
}): { manager: SessionManager; chatSendSpy: ReturnType<typeof vi.fn>; interruptSpy: ReturnType<typeof vi.fn> } {
  const chatSendSpy = vi.fn(async (
    _sessionId: string,
    _input: unknown,
    onEvent: (e: SakanaStreamEvent) => void
  ) => {
    for (const e of opts.events ?? []) onEvent(e);
    return { finalText: opts.finalText ?? "", interrupted: opts.interrupted ?? false };
  });
  const interruptSpy = vi.fn(async () => ({ ok: true, partialText: "partial" }));
  const manager = {
    chatSend: chatSendSpy,
    interrupt: interruptSpy,
  } as unknown as SessionManager;
  return { manager, chatSendSpy, interruptSpy };
}

describe("ChatSendInputSchema", () => {
  it("requires a non-empty sessionId and message", () => {
    expect(() => ChatSendInputSchema.parse({ sessionId: "", message: "hi" })).toThrow();
    expect(() => ChatSendInputSchema.parse({ sessionId: "s1", message: "" })).toThrow();
  });

  it("applies defaults for enableThinking/webSearch", () => {
    const parsed = ChatSendInputSchema.parse({ sessionId: "s1", message: "hi" });
    expect(parsed.enableThinking).toBe(false);
    expect(parsed.webSearch).toBe(true);
  });

  it("accepts signal:\"abort\"", () => {
    const parsed = ChatSendInputSchema.parse({
      sessionId: "s1",
      message: "hi",
      signal: "abort",
    });
    expect(parsed.signal).toBe("abort");
  });
});

describe("eventToLogPayload", () => {
  it("maps stream → token", () => {
    expect(eventToLogPayload({ type: "stream", token: "x" })).toEqual({
      type: "token",
      text: "x",
    });
  });

  it("maps finalAnswer → final", () => {
    expect(
      eventToLogPayload({ type: "finalAnswer", text: "done", interrupted: false })
    ).toEqual({ type: "final", text: "done", interrupted: false });
  });

  it("maps error → error", () => {
    expect(
      eventToLogPayload({ type: "error", code: "rate_limited", message: "slow" })
    ).toEqual({ type: "error", code: "rate_limited", message: "slow" });
  });

  it("drops createdMessage (not surfaced to client stream)", () => {
    expect(eventToLogPayload({ type: "createdMessage", messageId: "m" })).toBeNull();
  });

  it("drops unknown events", () => {
    expect(eventToLogPayload({ type: "unknown", raw: "x" })).toBeNull();
  });
});

describe("chat_send handler", () => {
  it("returns the final answer text (P2 non-stream)", async () => {
    const { manager } = mockManager({ finalText: "Hello world", interrupted: false });
    const input = ChatSendInputSchema.parse({
      sessionId: "s1",
      message: "hi",
    });
    const result = await chatSendTool.handler(manager, input);
    const parsed = JSON.parse(result);
    expect(parsed.type).toBe("final");
    expect(parsed.text).toBe("Hello world");
    expect(parsed.interrupted).toBe(false);
    expect(parsed.messageId).toBeTypeOf("string");
  });

  it("emits a log payload per stream event (P3 streaming)", async () => {
    const events: SakanaStreamEvent[] = [
      { type: "status", status: "started" },
      { type: "stream", token: "Hello" },
      { type: "stream", token: " world" },
      { type: "finalAnswer", text: "Hello world", interrupted: false },
    ];
    const { manager } = mockManager({
      finalText: "Hello world",
      interrupted: false,
      events,
    });
    const notified: ChatStreamLogPayload[] = [];
    const input = ChatSendInputSchema.parse({ sessionId: "s1", message: "hi" });
    await chatSendTool.handler(manager, input, {
      notify: (p) => notified.push(p),
    });
    expect(notified).toEqual([
      { type: "status", status: "started" },
      { type: "token", text: "Hello" },
      { type: "token", text: " world" },
      { type: "final", text: "Hello world", interrupted: false },
    ]);
  });

  it("signal:\"abort\" short-circuits via manager.interrupt", async () => {
    const { manager, interruptSpy, chatSendSpy } = mockManager({});
    const input = ChatSendInputSchema.parse({
      sessionId: "s1",
      message: "hi",
      signal: "abort",
    });
    const result = await chatSendTool.handler(manager, input);
    expect(interruptSpy).toHaveBeenCalledWith("s1");
    expect(chatSendSpy).not.toHaveBeenCalled();
    const parsed = JSON.parse(result);
    expect(parsed.interrupted).toBe(true);
    expect(parsed.text).toBe("partial");
  });

  it("propagates interrupted=true from the stream", async () => {
    const { manager } = mockManager({ finalText: "", interrupted: true });
    const input = ChatSendInputSchema.parse({ sessionId: "s1", message: "hi" });
    const result = await chatSendTool.handler(manager, input);
    expect(JSON.parse(result).interrupted).toBe(true);
  });

  it("survives a notify callback that throws (best-effort)", async () => {
    const events: SakanaStreamEvent[] = [
      { type: "stream", token: "x" },
      { type: "finalAnswer", text: "x", interrupted: false },
    ];
    const { manager } = mockManager({
      finalText: "x",
      interrupted: false,
      events,
    });
    const input = ChatSendInputSchema.parse({ sessionId: "s1", message: "hi" });
    // notify throws — handler must not propagate the failure.
    const result = await chatSendTool.handler(manager, input, {
      notify: () => {
        throw new Error("notification transport down");
      },
    });
    expect(JSON.parse(result).text).toBe("x");
  });

  it("works without a deps object (no notifications)", async () => {
    const events: SakanaStreamEvent[] = [
      { type: "stream", token: "y" },
      { type: "finalAnswer", text: "y", interrupted: false },
    ];
    const { manager } = mockManager({
      finalText: "y",
      interrupted: false,
      events,
    });
    const input = ChatSendInputSchema.parse({ sessionId: "s1", message: "hi" });
    const result = await chatSendTool.handler(manager, input);
    expect(JSON.parse(result).text).toBe("y");
  });
});
