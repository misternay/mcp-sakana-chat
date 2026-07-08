/**
 * Browser pool (spec §2.2, ADR-003).
 *
 * One persistent Playwright Chromium context per session, stored under
 * <sessionDir>/.local-chrome/ so cf_clearance + sakana-chat cookies survive
 * across chat_send calls. Idle timeout closes the context but keeps state.json.
 *
 * Hard cap: maxSessions concurrent contexts (default 5).
 */

import { chromium, type BrowserContext, type Page } from "playwright";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

export interface BrowserContextHandle {
  context: BrowserContext;
  page: Page;
  /** Absolute path to the persistent context directory. */
  contextPath: string;
}

export class BrowserPool {
  private handles = new Map<string, BrowserContextHandle>();
  private idleTimers = new Map<string, NodeJS.Timeout>();

  private chunkListener?: (tag: string, chunk: string) => void;

  constructor(
    private readonly sessionsDir: string,
    private readonly maxSessions: number,
    private readonly idleTimeoutMs: number
  ) {}

  setChunkListener(listener: (tag: string, chunk: string) => void) {
    this.chunkListener = listener;
  }

  private contextPathFor(sessionId: string): string {
    return join(this.sessionsDir, sessionId, ".local-chrome");
  }

  /**
   * Acquire (or reuse) a persistent browser context for a session.
   * Clears any pending idle timer for this session.
   */
  async acquire(sessionId: string, headless: boolean): Promise<BrowserContextHandle> {
    const existing = this.handles.get(sessionId);
    if (existing) {
      this.clearIdleTimer(sessionId);
      return existing;
    }

    if (this.handles.size >= this.maxSessions) {
      throw new Error(
        `Session cap reached (${this.maxSessions}). Close an existing session first.`
      );
    }

    const contextPath = this.contextPathFor(sessionId);
    await mkdir(contextPath, { recursive: true });

    const context = await chromium.launchPersistentContext(contextPath, {
      headless,
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });
    const page = context.pages()[0] ?? (await context.newPage());

    await page.exposeFunction("onSakanaChunk", (tag: string, chunk: string) => {
      this.chunkListener?.(tag, chunk);
    }).catch(() => {
      // ignore already exposed function errors
    });

    const handle: BrowserContextHandle = { context, page, contextPath };
    this.handles.set(sessionId, handle);
    return handle;
  }

  get(sessionId: string): BrowserContextHandle | undefined {
    return this.handles.get(sessionId);
  }

  isAcquired(sessionId: string): boolean {
    return this.handles.has(sessionId);
  }

  /**
   * Close the browser context for a session. Keeps the persistent dir on disk
   * so cookies survive a later reopen.
   */
  async release(sessionId: string): Promise<void> {
    this.clearIdleTimer(sessionId);
    const handle = this.handles.get(sessionId);
    if (!handle) return;
    this.handles.delete(sessionId);
    try {
      await handle.context.close();
    } catch {
      // best-effort close
    }
  }

  /**
   * Schedule an idle-timeout auto-close. Called after each chat_send completes.
   */
  scheduleIdleClose(sessionId: string): void {
    this.clearIdleTimer(sessionId);
    const timer = setTimeout(() => {
      void this.release(sessionId).catch(() => {});
    }, this.idleTimeoutMs);
    timer.unref?.();
    this.idleTimers.set(sessionId, timer);
  }

  private clearIdleTimer(sessionId: string): void {
    const timer = this.idleTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(sessionId);
    }
  }

  async closeAll(): Promise<void> {
    const ids = [...this.handles.keys()];
    await Promise.all(ids.map((id) => this.release(id)));
  }
}
