/**
 * Per-session JSON file store (spec §2.2, §4).
 *
 * One directory per session under <sessionsDir>/<sessionId>/:
 *   - state.json   (this module)
 *   - .local-chrome/  (persistent browser context, owned by pool.ts)
 *
 * No SQLite — matches bagidea-mcp convention. Sessions are few.
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
  constructor(private readonly sessionsDir: string) {}

  private dirFor(sessionId: string): string {
    return join(this.sessionsDir, sessionId);
  }

  private fileFor(sessionId: string): string {
    return join(this.dirFor(sessionId), "state.json");
  }

  async save(state: SessionState): Promise<void> {
    const dir = this.dirFor(state.sessionId);
    await mkdir(dir, { recursive: true });
    await writeFile(this.fileFor(state.sessionId), JSON.stringify(state, null, 2), "utf8");
  }

  async load(sessionId: string): Promise<SessionState | null> {
    try {
      const raw = await readFile(this.fileFor(sessionId), "utf8");
      return JSON.parse(raw) as SessionState;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async exists(sessionId: string): Promise<boolean> {
    try {
      await stat(this.fileFor(sessionId));
      return true;
    } catch {
      return false;
    }
  }

  async delete(sessionId: string, keepHistory: boolean): Promise<void> {
    if (keepHistory) {
      // keep state.json, remove only browser context dir
      return;
    }
    await rm(this.dirFor(sessionId), { recursive: true, force: true });
  }

  async list(): Promise<SessionState[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(this.sessionsDir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const states: SessionState[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const state = await this.load(entry.name);
      if (state) states.push(state);
    }
    return states;
  }
}
