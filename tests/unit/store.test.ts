/**
 * Unit tests: store.ts
 *
 * Per-session JSON file CRUD (spec 4).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SessionState } from "../../src/sessions/store.js";

async function importFresh() {
  const mod = await import("../../src/sessions/store.js");
  return mod;
}

let tmpDir: string;

beforeEach(async () => {
  vi.resetModules();
  tmpDir = await mkdtemp(join(tmpdir(), "bac-test-store-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: "bac_test-001",
    mode: "anonymous",
    tosAcceptedAt: "2026-06-28T00:00:00Z",
    conversationId: null,
    systemMessageId: null,
    createdAt: "2026-06-28T00:00:00Z",
    lastSeen: "2026-06-28T01:00:00Z",
    messagesExchanged: 0,
    rateBucket: { tokens: 10, refilledAt: "2026-06-28T00:00:00Z" },
    browserContextPath: join(tmpDir, "bac_test-001", ".local-chrome"),
    ...overrides,
  };
}

describe("SessionStore", () => {
  it("save() creates directory and writes state.json", async () => {
    const { SessionStore } = await importFresh();
    const store = new SessionStore(tmpDir);
    const state = makeState();

    await store.save(state);
    const loaded = await store.load("bac_test-001");
    expect(loaded).not.toBeNull();
    expect(loaded!.sessionId).toBe("bac_test-001");
    expect(loaded!.mode).toBe("anonymous");
    expect(loaded!.messagesExchanged).toBe(0);
  });

  it("load() returns null for nonexistent session", async () => {
    const { SessionStore } = await importFresh();
    const store = new SessionStore(tmpDir);
    expect(await store.load("nonexistent")).toBeNull();
  });

  it("exists() returns true after save", async () => {
    const { SessionStore } = await importFresh();
    const store = new SessionStore(tmpDir);
    await store.save(makeState());
    expect(await store.exists("bac_test-001")).toBe(true);
  });

  it("exists() returns false for nonexistent session", async () => {
    const { SessionStore } = await importFresh();
    const store = new SessionStore(tmpDir);
    expect(await store.exists("nonexistent")).toBe(false);
  });

  it("save() updates existing state", async () => {
    const { SessionStore } = await importFresh();
    const store = new SessionStore(tmpDir);
    await store.save(makeState());
    await store.save(makeState({ messagesExchanged: 5, conversationId: "conv-123" }));

    const loaded = await store.load("bac_test-001");
    expect(loaded!.messagesExchanged).toBe(5);
    expect(loaded!.conversationId).toBe("conv-123");
  });

  it("delete() removes the session directory", async () => {
    const { SessionStore } = await importFresh();
    const store = new SessionStore(tmpDir);
    await store.save(makeState());

    await store.delete("bac_test-001", false);
    expect(await store.exists("bac_test-001")).toBe(false);
    expect(await store.load("bac_test-001")).toBeNull();
  });

  it("delete() with keepHistory=true keeps state.json", async () => {
    const { SessionStore } = await importFresh();
    const store = new SessionStore(tmpDir);
    await store.save(makeState());

    await store.delete("bac_test-001", true);
    expect(await store.exists("bac_test-001")).toBe(true);
    expect(await store.load("bac_test-001")).not.toBeNull();
  });

  it("delete() is idempotent for nonexistent session", async () => {
    const { SessionStore } = await importFresh();
    const store = new SessionStore(tmpDir);
    await expect(store.delete("nonexistent", false)).resolves.toBeUndefined();
  });

  it("list() returns empty array when no sessions exist", async () => {
    const { SessionStore } = await importFresh();
    const store = new SessionStore(tmpDir);
    expect(await store.list()).toEqual([]);
  });

  it("list() returns empty array when sessions dir does not exist", async () => {
    const { SessionStore } = await importFresh();
    const store = new SessionStore(join(tmpDir, "does-not-exist"));
    expect(await store.list()).toEqual([]);
  });

  it("list() returns all saved sessions", async () => {
    const { SessionStore } = await importFresh();
    const store = new SessionStore(tmpDir);

    await store.save(makeState({ sessionId: "bac_aaa" }));
    await store.save(makeState({ sessionId: "bac_bbb", messagesExchanged: 3 }));
    await store.save(makeState({ sessionId: "bac_ccc", mode: "authenticated" }));

    const sessions = await store.list();
    expect(sessions).toHaveLength(3);

    const ids = sessions.map((s) => s.sessionId).sort();
    expect(ids).toEqual(["bac_aaa", "bac_bbb", "bac_ccc"]);
  });

  it("list() preserves full session state round-trip", async () => {
    const { SessionStore } = await importFresh();
    const store = new SessionStore(tmpDir);
    const original = makeState({
      sessionId: "bac_full",
      mode: "authenticated",
      conversationId: "conv-abc",
      systemMessageId: "sys-xyz",
      messagesExchanged: 42,
      rateBucket: { tokens: 5, refilledAt: "2026-06-28T02:00:00Z" },
    });

    await store.save(original);
    const sessions = await store.list();
    expect(sessions).toHaveLength(1);

    const s = sessions[0];
    expect(s.sessionId).toBe("bac_full");
    expect(s.mode).toBe("authenticated");
    expect(s.conversationId).toBe("conv-abc");
    expect(s.systemMessageId).toBe("sys-xyz");
    expect(s.messagesExchanged).toBe(42);
    expect(s.rateBucket.tokens).toBe(5);
  });
});