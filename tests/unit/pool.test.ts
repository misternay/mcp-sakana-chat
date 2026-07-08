/**
 * Unit tests: browser pool (pool.ts)
 *
 * Tests BrowserPool state management: acquire, get, isAcquired, release,
 * max session cap, idle timer, closeAll. Playwright is mocked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("playwright", () => {
  const fakePage = {
    goto: vi.fn(),
    locator: vi.fn(() => ({
      first: vi.fn(() => ({
        waitFor: vi.fn().mockRejectedValue(new Error("not found")),
        isVisible: vi.fn().mockRejectedValue(new Error("not found")),
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

import { BrowserPool } from "../../src/browser/pool.js";

let sessionsDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  const { mkdtemp } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  sessionsDir = await mkdtemp(join(tmpdir(), "bac-test-pool-"));
});

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await rm(sessionsDir, { recursive: true, force: true });
});

describe("BrowserPool", () => {
  it("acquire() launches persistent context and returns a handle", async () => {
    const pool = new BrowserPool(sessionsDir, 5, 15 * 60 * 1000);
    const handle = await pool.acquire("bac_001", true);

    expect(handle).toBeDefined();
    expect(handle.context).toBeDefined();
    expect(handle.page).toBeDefined();
    expect(handle.contextPath).toContain("bac_001");
    expect(handle.contextPath).toContain(".local-chrome");
    expect(pool.isAcquired("bac_001")).toBe(true);
  });

  it("get() returns handle for acquired session", async () => {
    const pool = new BrowserPool(sessionsDir, 5, 15 * 60 * 1000);
    await pool.acquire("bac_001", true);
    const handle = pool.get("bac_001");
    expect(handle).toBeDefined();
    expect(handle!.page).toBeDefined();
  });

  it("get() returns undefined for unknown session", async () => {
    const pool = new BrowserPool(sessionsDir, 5, 15 * 60 * 1000);
    expect(pool.get("nonexistent")).toBeUndefined();
  });

  it("isAcquired() returns false for unknown session", async () => {
    const pool = new BrowserPool(sessionsDir, 5, 15 * 60 * 1000);
    expect(pool.isAcquired("nonexistent")).toBe(false);
  });

  it("acquire() reuses existing handle (does not launch new context)", async () => {
    const { chromium } = await import("playwright");
    const pool = new BrowserPool(sessionsDir, 5, 15 * 60 * 1000);

    const h1 = await pool.acquire("bac_001", true);
    const h2 = await pool.acquire("bac_001", true);

    expect(h2).toBe(h1);
    expect(chromium.launchPersistentContext).toHaveBeenCalledTimes(1);
  });

  it("release() closes context and removes from pool", async () => {
    const pool = new BrowserPool(sessionsDir, 5, 15 * 60 * 1000);
    const handle = await pool.acquire("bac_001", true);

    await pool.release("bac_001");
    expect(pool.isAcquired("bac_001")).toBe(false);
    expect(handle.context.close).toHaveBeenCalled();
  });

  it("release() is a no-op for unknown session", async () => {
    const pool = new BrowserPool(sessionsDir, 5, 15 * 60 * 1000);
    await expect(pool.release("nonexistent")).resolves.toBeUndefined();
  });

  it("throws when max sessions cap is reached", async () => {
    const pool = new BrowserPool(sessionsDir, 2, 15 * 60 * 1000);
    await pool.acquire("bac_a", true);
    await pool.acquire("bac_b", true);

    await expect(pool.acquire("bac_c", true)).rejects.toThrow("Session cap reached");
  });

  it("scheduleIdleClose() does not throw", async () => {
    const pool = new BrowserPool(sessionsDir, 5, 15 * 60 * 1000);
    await pool.acquire("bac_001", true);
    expect(() => pool.scheduleIdleClose("bac_001")).not.toThrow();
    expect(() => pool.scheduleIdleClose("nonexistent")).not.toThrow();
  });

  it("closeAll() releases all sessions", async () => {
    const pool = new BrowserPool(sessionsDir, 5, 15 * 60 * 1000);
    await pool.acquire("bac_a", true);
    await pool.acquire("bac_b", true);

    await pool.closeAll();
    expect(pool.isAcquired("bac_a")).toBe(false);
    expect(pool.isAcquired("bac_b")).toBe(false);
  });
});