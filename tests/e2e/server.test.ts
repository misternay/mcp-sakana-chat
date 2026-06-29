/**
 * E2E / integration tests: MCP server request handling
 *
 * Tests the full MCP server request pipeline: ListTools, CallTool
 * with the real server instance (no browser — manager is tested in unit).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
  tmpDir = await mkdtemp(join(tmpdir(), "bac-test-e2e-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("MCP Server Tools Registration", () => {
  it("registers all 3 P1 tools", async () => {
    const { sessionOpenTool } = await import("../../src/tools/session_open.js");
    const { sessionCloseTool } = await import("../../src/tools/session_close.js");
    const { sessionListTool } = await import("../../src/tools/session_list.js");

    const toolNames = [sessionOpenTool.name, sessionCloseTool.name, sessionListTool.name];
    expect(toolNames).toEqual(["session_open", "session_close", "session_list"]);

    const { zodToJsonSchema } = await import("zod-to-json-schema");
    for (const tool of [sessionOpenTool, sessionCloseTool, sessionListTool]) {
      const jsonSchema = zodToJsonSchema(tool.schema);
      expect(jsonSchema).toBeDefined();
      expect(jsonSchema.type).toBe("object");
    }
  });
});

describe("session_list handler (integration with store)", () => {
  it("returns empty sessions array when no sessions exist", async () => {
    const { SessionManager } = await import("../../src/sessions/manager.js");
    const { sessionListTool } = await import("../../src/tools/session_list.js");

    const cfg = makeConfig();
    const mgr = new SessionManager(cfg);
    const result = await sessionListTool.handler(mgr, {});

    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ sessions: [] });
  });
});

describe("session_close handler (integration with store)", () => {
  it("returns closed:true with messagesExchanged=0 for unknown session", async () => {
    const { SessionManager } = await import("../../src/sessions/manager.js");
    const { sessionCloseTool } = await import("../../src/tools/session_close.js");

    const cfg = makeConfig();
    const mgr = new SessionManager(cfg);
    const result = await sessionCloseTool.handler(mgr, {
      sessionId: "bac_nonexistent",
      keepHistory: false,
    });

    const parsed = JSON.parse(result);
    expect(parsed).toEqual({ closed: true, messagesExchanged: 0 });
  });
});