/**
 * Integration tests: transport/http-sse.ts
 *
 * Tests the HTTP/SSE transport layer:
 * - Health endpoint (no auth)
 * - Auth gate on /sse and /messages
 * - SSE session establishment
 * - POST message routing
 * - 404 for unknown routes
 * - End-to-end SSE + message round-trip
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Config } from "../../src/config.js";
import type { SessionManager } from "../../src/sessions/manager.js";
import { createHttpsseTransport, type HttpsseTransport } from "../../src/transport/http-sse.js";

let currentPort = 19876;
const TEST_HOST = "127.0.0.1";

function makeConfig(overrides: Partial<Config> = {}): Config {
  const port = ++currentPort;
  return {
    transportMode: "http-sse",
    authKey: "",
    port,
    host: TEST_HOST,
    idleTimeoutMs: 15 * 60 * 1000,
    maxSessions: 5,
    dataDir: "/tmp/bac-test-config",
    sessionsDir: "/tmp/bac-test-config/bac-sessions",
    tosAckFile: "/tmp/bac-test-config/bac-tos-ack.json",
    redactPii: false,
    allowedUseCases: ["personal", "internal"],
    sakanaUrl: "https://chat.sakana.ai/",
    ...overrides,
  };
}

function makeMockManager(): SessionManager {
  return {
    open: async () => ({
      sessionId: "bac_mock",
      conversationId: null,
      mode: "anonymous" as const,
      rateLimit: { windowMs: 900000, maxMessages: 10 },
    }),
    close: async (_id: string, _keep: boolean) => ({
      closed: true as const,
      messagesExchanged: 0,
    }),
    list: async () => [],
    get: async () => null,
    shutdown: async () => {},
    store: {} as any,
    pool: {} as any,
    tos: {} as any,
  } as unknown as SessionManager;
}

async function fetchJson(
  path: string,
  opts: { headers?: Record<string, string>; method?: string; body?: string } = {}
) {
  const res = await fetch("http://" + TEST_HOST + ":" + currentPort + path, {
    method: opts.method ?? "GET",
    headers: { "content-type": "application/json", ...opts.headers },
    body: opts.body,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, headers: res.headers, json, text };
}

describe("HTTP/SSE Transport", () => {
  describe("without auth", () => {
    let transport: HttpsseTransport;

    beforeAll(async () => {
      transport = createHttpsseTransport(makeConfig({ authKey: "" }), makeMockManager());
      await transport.start();
    });

    afterAll(async () => {
      await transport.shutdown();
    });

    it("GET /health returns 200 with status ok", async () => {
      const { status, json } = await fetchJson("/health");
      expect(status).toBe(200);
      expect(json).toEqual({ status: "ok", transport: "http-sse", sessions: 0 });
    });

    it("GET /sse establishes SSE stream", async () => {
      const res = await fetch("http://" + TEST_HOST + ":" + currentPort + "/sse", {
        headers: { accept: "text/event-stream" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      res.body?.cancel();
    });

    it("POST /messages without sessionId returns 400", async () => {
      const { status, json } = await fetchJson("/messages", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      });
      expect(status).toBe(400);
      expect(json.error).toContain("sessionId");
    });

    it("POST /messages with unknown sessionId returns 404", async () => {
      const { status, json } = await fetchJson("/messages?sessionId=nonexistent", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      });
      expect(status).toBe(404);
      expect(json.error).toContain("not found");
    });

    it("returns 404 for unknown routes", async () => {
      const { status, json } = await fetchJson("/unknown");
      expect(status).toBe(404);
      expect(json.error).toContain("Not found");
    });
  });

  describe("with auth", () => {
    let transport: HttpsseTransport;

    beforeAll(async () => {
      transport = createHttpsseTransport(makeConfig({ authKey: "test-key-12345" }), makeMockManager());
      await transport.start();
    });

    afterAll(async () => {
      await transport.shutdown();
    });

    it("GET /health is still accessible without auth", async () => {
      const { status, json } = await fetchJson("/health");
      expect(status).toBe(200);
      expect(json.status).toBe("ok");
    });

    it("GET /sse without auth returns 401", async () => {
      const { status, json } = await fetchJson("/sse");
      expect(status).toBe(401);
      expect(json.error).toContain("Missing Authorization");
    });

    it("GET /sse with wrong token returns 401", async () => {
      const { status, json } = await fetchJson("/sse", {
        headers: { authorization: "Bearer wrong" },
      });
      expect(status).toBe(401);
      expect(json.error).toContain("Invalid auth token");
    });

    it("GET /sse with malformed header returns 401", async () => {
      const { status, json } = await fetchJson("/sse", {
        headers: { authorization: "NotBearer xyz" },
      });
      expect(status).toBe(401);
      expect(json.error).toContain("Malformed");
    });

    it("GET /sse with correct token establishes SSE", async () => {
      const res = await fetch("http://" + TEST_HOST + ":" + currentPort + "/sse", {
        headers: {
          accept: "text/event-stream",
          authorization: "Bearer test-key-12345",
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
      res.body?.cancel();
    });

    it("POST /messages without auth returns 401", async () => {
      const { status, json } = await fetchJson("/messages?sessionId=x", {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(status).toBe(401);
    });

    it("POST /messages with correct token but bad session returns 404", async () => {
      const { status, json } = await fetchJson("/messages?sessionId=nonexistent", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
        headers: { authorization: "Bearer test-key-12345" },
      });
      expect(status).toBe(404);
      expect(json.error).toContain("not found");
    });

    it("POST /messages without sessionId returns 400 (even with auth)", async () => {
      const { status, json } = await fetchJson("/messages", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
        headers: { authorization: "Bearer test-key-12345" },
      });
      expect(status).toBe(400);
      expect(json.error).toContain("sessionId");
    });
  });

  describe("end-to-end SSE + message round-trip", () => {
    let transport: HttpsseTransport;

    beforeAll(async () => {
      transport = createHttpsseTransport(makeConfig(), makeMockManager());
      await transport.start();
    });

    afterAll(async () => {
      await transport.shutdown();
    });

    it("can establish SSE, extract sessionId, and POST a tools/list", async () => {
      const sseRes = await fetch("http://" + TEST_HOST + ":" + currentPort + "/sse", {
        headers: { accept: "text/event-stream" },
      });
      expect(sseRes.status).toBe(200);

      const reader = sseRes.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (buf.includes("\n\n")) break;
      }
      // Do NOT cancel the reader — that kills the SSE connection server-side,
      // and handlePostMessage will fail with "SSE connection not established".

      const match = buf.match(/\/messages\?sessionId=([a-f0-9-]+)/);
      expect(match).toBeTruthy();
      const sessionId = match![1];

      const { status, json } = await fetchJson("/messages?sessionId=" + sessionId, {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
      });
      expect(status).toBe(202);
      // SDK's handlePostMessage returns 202 with text body "Accepted"
      expect(json._raw).toBe("Accepted");
    });
  });
});
