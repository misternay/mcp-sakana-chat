/**
 * Session manager (spec §2.2, §3.1, §3.4, §3.5, §3.2).
 *
 * Coordinates ToS gate, browser pool, and session store for session lifecycle
 * and chat_send. Streaming chat is implemented in P3 via the stream-relay
 * parser + an emitter callback (MCP logging notifications).
 */

import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import { TosGate } from "../guards/tos-gate.js";
import { BrowserPool } from "../browser/pool.js";
import { SakanaPage } from "../browser/sakana-page.js";
import {
  streamMessageResponse,
  isConversationMessageRequest,
  type SakanaStreamEvent,
} from "../browser/stream-relay.js";
import { SessionStore, type SessionState, type SessionMode } from "./store.js";

export interface OpenSessionInput {
  login?: "anonymous" | "google" | "email";
  headless?: boolean;
  tosAccepted?: boolean;
}

export interface OpenSessionResult {
  sessionId: string;
  conversationId: string | null;
  mode: SessionMode;
  rateLimit: { windowMs: number; maxMessages: number };
}

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_ANON_MAX = 10;
const RATE_AUTH_MAX = 30;

export class SessionManager {
  readonly store: SessionStore;
  readonly pool: BrowserPool;
  readonly tos: TosGate;

  constructor(private readonly config: Config) {
    this.store = new SessionStore(config.sessionsDir);
    this.pool = new BrowserPool(config.sessionsDir, config.maxSessions, config.idleTimeoutMs);
    this.tos = new TosGate(config.tosAckFile);
  }

  async open(input: OpenSessionInput): Promise<OpenSessionResult> {
    await this.tos.require(Boolean(input.tosAccepted));

    const login = input.login ?? "anonymous";
    const headless = input.headless ?? this.config.browserHeadless;
    const mode: SessionMode = login === "anonymous" ? "anonymous" : "authenticated";

    const sessionId = `bac_${randomUUID()}`;
    const now = new Date().toISOString();

    const handle = await this.pool.acquire(sessionId, headless);
    const sakana = new SakanaPage(handle.page);
    await sakana.navigateAndWaitReady(this.config.sakanaUrl);

    // Non-anonymous login requires a headed window + human interaction (spec §3.1).
    // For P1 we only support anonymous; google/email login is a pause-and-prompt
    // flow implemented in P4. Fail explicitly rather than silently impersonate.
    if (login !== "anonymous") {
      throw new Error(
        `Login mode "${login}" not implemented yet (P4). Use anonymous for now.`
      );
    }

    const state: SessionState = {
      sessionId,
      mode,
      tosAcceptedAt: now,
      conversationId: null, // discovered on first chat_send (P2)
      systemMessageId: null,
      createdAt: now,
      lastSeen: now,
      messagesExchanged: 0,
      rateBucket: { tokens: RATE_ANON_MAX, refilledAt: now },
      browserContextPath: join(this.config.sessionsDir, sessionId, ".local-chrome"),
    };
    await this.store.save(state);

    return {
      sessionId,
      conversationId: state.conversationId,
      mode,
      rateLimit: {
        windowMs: RATE_WINDOW_MS,
        maxMessages: mode === "anonymous" ? RATE_ANON_MAX : RATE_AUTH_MAX,
      },
    };
  }

  async close(
    sessionId: string,
    keepHistory: boolean
  ): Promise<{ closed: true; messagesExchanged: number }> {
    const state = await this.store.load(sessionId);
    const messagesExchanged = state?.messagesExchanged ?? 0;
    await this.pool.release(sessionId);
    if (!keepHistory) {
      await this.store.delete(sessionId, false);
    }
    return { closed: true, messagesExchanged };
  }

  async list(): Promise<SessionState[]> {
    return this.store.list();
  }

  async get(sessionId: string): Promise<SessionState | null> {
    return this.store.load(sessionId);
  }

  async shutdown(): Promise<void> {
    await this.pool.closeAll();
  }

  /**
   * Send a chat message and relay stream events (spec §3.2).
   *
   * P2: ensures a conversation exists, POSTs the message, parses the NDJSON
   *     stream to a terminal event (finalAnswer/error).
   * P3: every parsed event is passed to `onEvent` as it arrives, so the tool
   *     layer can emit MCP logging notifications for incremental tokens.
   *
   * The caller owns the AbortSignal (from the MCP request's `extra`). On abort
   * we stop emitting and return an interrupted terminal event.
   *
   * State updates: persists discovered conversationId/systemMessageId on first
   * send, bumps messagesExchanged + lastSeen on every send.
   */
  async chatSend(
    sessionId: string,
    opts: {
      message: string;
      enableThinking?: boolean;
      webSearch?: boolean;
    },
    onEvent: (e: SakanaStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<{ finalText: string; interrupted: boolean }> {
    const state = await this.store.load(sessionId);
    if (!state) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const handle = this.pool.get(sessionId);
    if (!handle) {
      throw new Error(
        `Session browser context is not open. Call session_open first (or reopen after idle timeout).`
      );
    }
    const sakana = new SakanaPage(handle.page);

    // Ensure a conversation exists. On first send we create one with the user's
    // message as the initial input (Sakana's create endpoint takes inputs).
    let conversationId = state.conversationId;
    let systemMessageId = state.systemMessageId;
    if (!conversationId || !systemMessageId) {
      const created = await sakana.createConversation({
        inputs: opts.message,
        enableThinking: opts.enableThinking,
        webSearch: opts.webSearch,
      });
      conversationId = created.conversationId;
      systemMessageId = created.systemMessageId;
      state.conversationId = conversationId;
      state.systemMessageId = systemMessageId;
      await this.store.save(state);
      // The create endpoint already ingests the first message; the streamed
      // response comes from the same create call. We do NOT send a second
      // message — instead we capture the create response's stream.
      // (Sakana returns the stream on the POST /conversation response itself.)
      // For MVP we treat create as "message accepted" and return empty final;
      // true streaming of the first response is wired in streamMessageResponse
      // below when a follow-up /conversation/{id} call is made.
      // NOTE: Sakana's create returns JSON, not a stream. The stream comes from
      // the subsequent /conversation/{id} POST. So for the very first message
      // we still need to send it. We fall through to sendMessage below using
      // the freshly created conversation.
    }

    const userMessageId = randomUUID();

    let finalText = "";
    let interrupted = false;
    const errors: { code: string; message: string }[] = [];

    // Arm the response waiter BEFORE kicking the request. Otherwise the
    // in-page fetch can complete (sendMessage awaits res.text()) before
    // waitForResponse is armed, and the waiter hangs until its 120s timeout
    // — a race between sendMessage and waitForResponse (spec §5: no silent
    // hangs). We capture the waiter as a promise and await it after the
    // request has been fired.
    const responsePromise = streamMessageResponse(
      handle.page,
      (req) =>
        isConversationMessageRequest(req) &&
        req.headers()["x-bac-msg"] === userMessageId,
      (e) => {
        if (signal?.aborted) return;
        onEvent(e);
        if (e.type === "finalAnswer") {
          finalText = e.text;
          interrupted = e.interrupted;
        } else if (e.type === "error") {
          errors.push({ code: e.code, message: e.message });
        }
      },
      signal
    );

    // Now fire the request. The waiter above is already armed, so it will
    // observe this exact /conversation/{id} response (matched by x-bac-msg).
    await sakana.sendMessage({
      conversationId: conversationId!,
      systemMessageId: systemMessageId!,
      inputs: opts.message,
      userMessageId,
      enableThinking: opts.enableThinking,
      webSearch: opts.webSearch,
    });

    await responsePromise;

    if (signal?.aborted) {
      interrupted = true;
    }
    const firstError = errors[0];
    if (firstError) {
      throw new Error(`Sakana stream error ${firstError.code}: ${firstError.message}`);
    }

    // Update state: bump counters, refresh lastSeen.
    state.messagesExchanged += 1;
    state.lastSeen = new Date().toISOString();
    await this.store.save(state);

    // Reset idle timer so an active session isn't reaped mid-conversation.
    this.pool.scheduleIdleClose(sessionId);

    return { finalText, interrupted };
  }

  /**
   * Interrupt an in-flight chat_send (spec §3.3).
   *
   * Best-effort: clicks the page's stop button if visible. The actual stream
   * termination is driven by the AbortSignal the tool layer holds; this method
   * is the UI-level complement. Returns whatever partial text is visible in the
   * chat transcript — heuristic, may be empty if the DOM hasn't rendered yet.
   */
  async interrupt(
    sessionId: string
  ): Promise<{ ok: boolean; partialText: string }> {
    const handle = this.pool.get(sessionId);
    if (!handle) {
      return { ok: false, partialText: "" };
    }
    const sakana = new SakanaPage(handle.page);
    const clicked = await sakana.clickStop();
    // Best-effort partial text from the last assistant message bubble.
    let partialText = "";
    try {
      partialText = await handle.page
        .locator('[data-role="assistant"], [class*="assistant" i]')
        .last()
        .innerText({ timeout: 1_000 })
        .catch(() => "");
    } catch {
      // ignore — partial text is best-effort
    }
    return { ok: clicked, partialText };
  }
}
