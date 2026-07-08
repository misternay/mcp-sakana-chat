/**
 * Unit tests: session manager (manager.ts)
 *
 * Spec 3.1, 3.4: session_open/close lifecycle. BrowserPool is fully mocked
 * so no Playwright binary is needed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("playwright", () => {
  const fakePage = {
    goto: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn(() => ({
      first: vi.fn(() => ({
        waitFor: vi.fn().mockResolvedValue(undefined),
        isVisible: vi.fn().mockResolvedValue(true),
      })),
    })),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    exposeFunction: vi.fn().mockResolvedValue(undefined),
  };
  const fakeContext = {
    pages: vi.fn(() => [fakePage]),
    newPage: vi.fn(() => fakePage),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    chromium: {
      launchPersistentContext: vi.fn().mockResolvedValue(fakeContext),
    },
  };
});

import type { Config } from "../../src/config.js";

let tmpDir: string;

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    transportMode: "stdio",
    authKey: "",
    port: 3456,
    host: "127.0.0.1",
    browserHeadless: true,
    idleTimeoutMs: 15 * 60 * 1000,
    maxSessions: 5,
    dataDir: tmpDir,
    sessionsDir: join(tmpDir, "bac-sessions"),
    tosAckFile: join(tmpDir, "bac-tos-ack.json"),
    redactPii: false,
    allowedUseCases: ["personal", "internal"],
    sakanaUrl: "https://chat.sakana.ai/",
    ...overrides,
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  tmpDir = await mkdtemp(join(tmpdir(), "bac-test-mgr-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("SessionManager", () => {
  it("constructor creates store, pool, and tos gate", async () => {
    const { SessionManager } = await import("../../src/sessions/manager.js");
    const cfg = makeConfig();
    const mgr = new SessionManager(cfg);

    expect(mgr.store).toBeDefined();
    expect(mgr.pool).toBeDefined();
    expect(mgr.tos).toBeDefined();
  });

  it("list() returns empty list before any sessions", async () => {
    const { SessionManager } = await import("../../src/sessions/manager.js");
    const cfg = makeConfig();
    const mgr = new SessionManager(cfg);

    const sessions = await mgr.list();
    expect(sessions).toEqual([]);
  });

  it("get() returns null for nonexistent session", async () => {
    const { SessionManager } = await import("../../src/sessions/manager.js");
    const cfg = makeConfig();
    const mgr = new SessionManager(cfg);

    expect(await mgr.get("nonexistent")).toBeNull();
  });

  it("close() handles nonexistent session gracefully", async () => {
    const { SessionManager } = await import("../../src/sessions/manager.js");
    const cfg = makeConfig();
    const mgr = new SessionManager(cfg);

    const result = await mgr.close("nonexistent", false);
    expect(result.closed).toBe(true);
    expect(result.messagesExchanged).toBe(0);
  });

  it("shutdown() resolves without error when no sessions open", async () => {
    const { SessionManager } = await import("../../src/sessions/manager.js");
    const cfg = makeConfig();
    const mgr = new SessionManager(cfg);

    await expect(mgr.shutdown()).resolves.toBeUndefined();
  });

  it("rejects non-anonymous login modes", async () => {
    const { SessionManager } = await import("../../src/sessions/manager.js");
    const cfg = makeConfig();
    const mgr = new SessionManager(cfg);

    // Accept ToS first
    await mgr.tos.require(true);

    await expect(
      mgr.open({ login: "google", tosAccepted: true })
    ).rejects.toThrow(/not implemented yet/);
  });

  it("rejects anonymous login when ToS not accepted", async () => {
    const { SessionManager } = await import("../../src/sessions/manager.js");
    const cfg = makeConfig();
    const mgr = new SessionManager(cfg);

    // TosNotAcceptedError extends Error; the message contains context
    await expect(mgr.open({})).rejects.toThrow(/Terms of Service not accepted/);
    await expect(mgr.open({ tosAccepted: false })).rejects.toThrow(/Terms of Service not accepted/);
  });

  it("opens anonymous session when ToS is accepted (mocked browser)", async () => {
    const { SessionManager } = await import("../../src/sessions/manager.js");
    const cfg = makeConfig();
    const mgr = new SessionManager(cfg);

    const result = await mgr.open({ tosAccepted: true });

    expect(result.sessionId).toMatch(/^bac_/);
    expect(result.mode).toBe("anonymous");
    expect(result.conversationId).toBeNull();
    expect(result.rateLimit.windowMs).toBe(15 * 60 * 1000);
    expect(result.rateLimit.maxMessages).toBe(10);

    // Should appear in list
    const sessions = await mgr.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].sessionId).toBe(result.sessionId);
  });

  it("close() after open returns messagesExchanged=0", async () => {
    const { SessionManager } = await import("../../src/sessions/manager.js");
    const cfg = makeConfig();
    const mgr = new SessionManager(cfg);

    const { sessionId } = await mgr.open({ tosAccepted: true });
    const result = await mgr.close(sessionId, false);

    expect(result.closed).toBe(true);
    expect(result.messagesExchanged).toBe(0);
  });
});