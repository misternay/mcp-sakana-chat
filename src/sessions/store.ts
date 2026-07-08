/**
 * Per-session JSON file store (spec §2.2, §4).
 *
 * One directory per session under <sessionsDir>/<sessionId>/:
 *   - state.json   (this module)
 *   - .local-chrome/  (persistent browser context, owned by pool.ts)
 *
 * No SQLite — matches bagidea-mcp convention. Sessions are few.
 *
 * Uses an in-memory Map as a write-through cache. With max 5 sessions
 * this avoids redundant filesystem reads on every chat_send call.
 */

import { mkdir, readFile, writeFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Dirent } from "node:fs";

export type SessionMode = "anonymous" | "authenticated";

export interface RateBucket {
  tokens: number;
  refilledAt: string; // ISO-8601
}

export interface SessionState {
  sessionId: string;
  mode: SessionMode;
  tosAcceptedAt: string; // ISO-8601
  conversationId: string | null;
  systemMessageId: string | null;
  createdAt: string; // ISO-8601
  lastSeen: string; // ISO-8601
  messagesExchanged: number;
  rateBucket: RateBucket;
  browserContextPath: string;
}

export class SessionStore {
  /** In-memory cache — populated on first list/load, write-through on save. */
  private cache = new Map<string, SessionState>();
  private cacheWarmed = false;

  constructor(private readonly sessionsDir: string) {}

  private dirFor(sessionId: string): string {
    return join(this.sessionsDir, sessionId);
  }

  private fileFor(sessionId: string): string {
    return join(this.dirFor(sessionId), "state.json");
  }

  /** Save state to disk and update the in-memory cache. */
  async save(state: SessionState): Promise<void> {
    const dir = this.dirFor(state.sessionId);
    await mkdir(dir, { recursive: true });
    await writeFile(this.fileFor(state.sessionId), JSON.stringify(state, null, 2), "utf8");
    this.cache.set(state.sessionId, state);
  }

  /** Load from cache first, then disk. Cache the result either way. */
  async load(sessionId: string): Promise<SessionState | null> {
    const cached = this.cache.get(sessionId);
    if (cached) return cached;

    try {
      const raw = await readFile(this.fileFor(sessionId), "utf8");
      const state = JSON.parse(raw) as SessionState;
      this.cache.set(sessionId, state);
      return state;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async exists(sessionId: string): Promise<boolean> {
    if (this.cache.has(sessionId)) return true;
    try {
      await stat(this.fileFor(sessionId));
      return true;
    } catch {
      return false;
    }
  }

  async delete(sessionId: string, keepHistory: boolean): Promise<void> {
    this.cache.delete(sessionId);
    if (keepHistory) {
      // keep state.json, remove only browser context dir
      return;
    }
    await rm(this.dirFor(sessionId), { recursive: true, force: true });
  }

  async list(): Promise<SessionState[]> {
    // If cache is warm and has entries, return from cache
    if (this.cacheWarmed) {
      return [...this.cache.values()];
    }

    let entries: Dirent[];
    try {
      entries = await readdir(this.sessionsDir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.cacheWarmed = true;
        return [];
      }
      throw err;
    }
    const states: SessionState[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const state = await this.load(entry.name);
      if (state) states.push(state);
    }
    this.cacheWarmed = true;
    return states;
  }
}
