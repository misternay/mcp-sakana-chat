/**
 * Unit tests: config.ts
 *
 * Tests loadConfig() with env vars, helper functions, TOS_SUMMARY, TOS_VERSION.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

async function importFresh() {
  const mod = await import("../../src/config.js");
  return mod;
}

const O_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...O_ENV };
  vi.resetModules();
});

afterEach(() => {
  process.env = O_ENV;
});

describe("loadConfig", () => {
  it("returns defaults when no env vars are set", async () => {
    delete process.env.BAC_TRANSPORT;
    delete process.env.BAC_AUTH_KEY;
    delete process.env.BAC_BROWSER_HEADLESS;
    delete process.env.BAC_IDLE_TIMEOUT_MS;
    delete process.env.BAC_MAX_SESSIONS;
    delete process.env.BAC_DATA_DIR;
    delete process.env.BAC_REDACT_PII;
    delete process.env.BAC_ALLOWED_USE_CASES;
    delete process.env.BAC_SAKANA_URL;

    const { loadConfig } = await importFresh();
    const cfg = loadConfig();

    expect(cfg.transportMode).toBe("stdio");
    expect(cfg.authKey).toBe("");
    expect(cfg.port).toBe(3456);
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.browserHeadless).toBe(true);
    expect(cfg.idleTimeoutMs).toBe(15 * 60 * 1000);
    expect(cfg.maxSessions).toBe(5);
    expect(cfg.redactPii).toBe(false);
    expect(cfg.allowedUseCases).toEqual(["personal", "internal"]);
    expect(cfg.sakanaUrl).toBe("https://chat.sakana.ai/");
    expect(cfg.dataDir).toContain(".background-ai-chat");
    expect(cfg.sessionsDir).toContain("bac-sessions");
    expect(cfg.tosAckFile).toContain("bac-tos-ack.json");
  });

  it("respects BAC_TRANSPORT=http-sse", async () => {
    process.env.BAC_TRANSPORT = "http-sse";
    const { loadConfig } = await importFresh();
    expect(loadConfig().transportMode).toBe("http-sse");
  });

  it("respects BAC_AUTH_KEY", async () => {
    process.env.BAC_AUTH_KEY = "secret123";
    const { loadConfig } = await importFresh();
    expect(loadConfig().authKey).toBe("secret123");
  });

  it("respects BAC_PORT", async () => {
    process.env.BAC_PORT = "9999";
    const { loadConfig } = await importFresh();
    expect(loadConfig().port).toBe(9999);
  });

  it("respects BAC_PORT with invalid value (falls back to default)", async () => {
    process.env.BAC_PORT = "not-a-number";
    const { loadConfig } = await importFresh();
    expect(loadConfig().port).toBe(3456);
  });

  it("respects BAC_HOST", async () => {
    process.env.BAC_HOST = "0.0.0.0";
    const { loadConfig } = await importFresh();
    expect(loadConfig().host).toBe("0.0.0.0");
  });

  it("respects BAC_BROWSER_HEADLESS=false", async () => {
    process.env.BAC_BROWSER_HEADLESS = "false";
    const { loadConfig } = await importFresh();
    expect(loadConfig().browserHeadless).toBe(false);
  });

  it("respects BAC_BROWSER_HEADLESS=0", async () => {
    process.env.BAC_BROWSER_HEADLESS = "0";
    const { loadConfig } = await importFresh();
    expect(loadConfig().browserHeadless).toBe(false);
  });

  it("respects BAC_IDLE_TIMEOUT_MS", async () => {
    process.env.BAC_IDLE_TIMEOUT_MS = "60000";
    const { loadConfig } = await importFresh();
    expect(loadConfig().idleTimeoutMs).toBe(60000);
  });

  it("respects BAC_MAX_SESSIONS", async () => {
    process.env.BAC_MAX_SESSIONS = "3";
    const { loadConfig } = await importFresh();
    expect(loadConfig().maxSessions).toBe(3);
  });

  it("respects BAC_DATA_DIR", async () => {
    process.env.BAC_DATA_DIR = "/tmp/bac-test";
    const { loadConfig } = await importFresh();
    expect(loadConfig().dataDir).toBe("/tmp/bac-test");
    expect(loadConfig().sessionsDir).toBe("/tmp/bac-test/bac-sessions");
    expect(loadConfig().tosAckFile).toBe("/tmp/bac-test/bac-tos-ack.json");
  });

  it("respects BAC_REDACT_PII=true", async () => {
    process.env.BAC_REDACT_PII = "true";
    const { loadConfig } = await importFresh();
    expect(loadConfig().redactPii).toBe(true);
  });

  it("respects BAC_ALLOWED_USE_CASES custom list", async () => {
    process.env.BAC_ALLOWED_USE_CASES = "research,education,personal";
    const { loadConfig } = await importFresh();
    expect(loadConfig().allowedUseCases).toEqual(["research", "education", "personal"]);
  });

  it("filters empty strings from BAC_ALLOWED_USE_CASES", async () => {
    process.env.BAC_ALLOWED_USE_CASES = "personal,,internal,";
    const { loadConfig } = await importFresh();
    expect(loadConfig().allowedUseCases).toEqual(["personal", "internal"]);
  });

  it("respects BAC_SAKANA_URL", async () => {
    process.env.BAC_SAKANA_URL = "https://staging.sakana.ai/";
    const { loadConfig } = await importFresh();
    expect(loadConfig().sakanaUrl).toBe("https://staging.sakana.ai/");
  });
});

describe("TOS_SUMMARY and TOS_VERSION", () => {
  it("TOS_SUMMARY is a non-empty string", async () => {
    const { TOS_SUMMARY } = await importFresh();
    expect(TOS_SUMMARY).toBeTruthy();
    expect(typeof TOS_SUMMARY).toBe("string");
  });

  it("TOS_VERSION is YYYY-MM-DD format", async () => {
    const { TOS_VERSION } = await importFresh();
    expect(TOS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});