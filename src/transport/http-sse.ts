/**
 * HTTP/SSE transport for background-ai-chat MCP server (spec §1, P5).
 *
 * Provides an HTTP server that accepts MCP-over-SSE connections:
 *   GET  /sse                 — establish SSE stream (creates SSEServerTransport)
 *   POST /messages?sessionId= — deliver MCP JSON-RPC messages
 *   GET  /health              — liveness check (no auth required)
 *
 * Each SSE connection gets its own Server + SSEServerTransport pair,
 * sharing the same tool registry / SessionManager state.
 *
 * Auth: when config.authKey is set, every /sse and /messages request
 * must carry `Authorization: Bearer <key>`. /health is exempt.
 *
 * Graceful shutdown: tracks all transports + the HTTP server;
 * shutdown() closes transports first, then the server.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server as HttpServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { Config } from "../config.js";
import { AuthGuard, AuthError } from "../guards/auth.js";
import type { SessionManager } from "../sessions/manager.js";
import { TOOLS, type ToolDeps } from "../tools/registry.js";
import type { ChatStreamLogPayload } from "../tools/chat_send.js";

/**
 * Create an MCP Server pre-wired with all tool handlers.
 * Each SSE connection gets its own instance (shared SessionManager).
 */
function createMcpServer(manager: SessionManager): Server {
  const server = new Server(
    { name: "background-ai-chat", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map(({ name, description, schema }) => ({
      name,
      description,
      inputSchema: zodToJsonSchema(schema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const entry = TOOLS.find((t) => t.name === name);
    if (!entry) {
      throw new Error(
        `Unknown tool: ${name}. Available: ${TOOLS.map((t) => t.name).join(", ")}`
      );
    }
    const input = entry.schema.parse(args ?? {});
    const deps: ToolDeps = {
      notify: (payload) => {
        void server
          .sendLoggingMessage({
            level: "info",
            data: payload,
          })
          .catch(() => {
            // best-effort; never break the stream on a notification failure
          });
      },
      signal: extra?.signal,
    };
    try {
      const result = await entry.handler(manager, input, deps);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[bac] tool ${name} error: ${rawMessage}\n`);
      return {
        content: [{ type: "text", text: `Error: ${rawMessage}` }],
        isError: true,
      };
    }
  });

  return server;
}

export interface HttpsseTransport {
  /** Start listening. Resolves when server is ready. */
  start(): Promise<void>;
  /** Gracefully close all SSE connections and the HTTP server. */
  shutdown(): Promise<void>;
}

export function createHttpsseTransport(
  config: Config,
  manager: SessionManager
): HttpsseTransport {
  const auth = new AuthGuard(config.authKey);
  // Map sessionId → { transport, server } for routing POST messages
  const sessions = new Map<
    string,
    { transport: SSEServerTransport; server: Server }
  >();

  const http: HttpServer = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      void handleRequest(req, res);
    }
  );

  async function handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const { method, url } = req;
    const parsed = url ? new URL(url, `http://${config.host}:${config.port}`) : null;
    const pathname = parsed?.pathname ?? "";

    // Health check — no auth required
    if (method === "GET" && pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "http-sse", sessions: sessions.size }));
      return;
    }

    // Auth gate for everything else
    try {
      auth.authenticate(req);
    } catch (err) {
      const message = err instanceof AuthError ? err.message : "Unauthorized";
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: message }));
      return;
    }

    // GET /sse — establish SSE stream
    if (method === "GET" && pathname === "/sse") {
      await handleSse(req, res);
      return;
    }

    // POST /messages?sessionId=... — deliver MCP message
    if (method === "POST" && pathname === "/messages") {
      await handleMessage(req, res);
      return;
    }

    // 404
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `Not found: ${method} ${pathname}` }));
  }

  async function handleSse(
    _req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const transport = new SSEServerTransport("/messages", res);
    const server = createMcpServer(manager);

    sessions.set(transport.sessionId, { transport, server });

    transport.onclose = () => {
      sessions.delete(transport.sessionId);
      process.stderr.write(
        `[bac] SSE session ${transport.sessionId} closed (${sessions.size} remaining)\n`
      );
    };

    await server.connect(transport);
    process.stderr.write(
      `[bac] SSE session ${transport.sessionId} connected\n`
    );
  }

  async function handleMessage(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const parsed = req.url
      ? new URL(req.url, `http://${config.host}:${config.port}`)
      : null;
    const sessionId = parsed?.searchParams.get("sessionId");
    if (!sessionId) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Missing ?sessionId query parameter" }));
      return;
    }

    const entry = sessions.get(sessionId);
    if (!entry) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: `Session ${sessionId} not found` }));
      return;
    }

    await entry.transport.handlePostMessage(req, res);
  }

  return {
    start(): Promise<void> {
      return new Promise((resolve, reject) => {
        http.on("error", reject);
        http.listen(config.port, config.host, () => {
          process.stderr.write(
            `[bac] HTTP/SSE transport listening on http://${config.host}:${config.port}\n`
          );
          if (!auth.isDisabled) {
            process.stderr.write(
              `[bac] auth enabled (key length: ${auth.keyLength} bytes)\n`
            );
          }
          resolve();
        });
      });
    },

    async shutdown(): Promise<void> {
      process.stderr.write(
        `[bac] shutting down HTTP/SSE transport (${sessions.size} active sessions)\n`
      );

      // Close all SSE transports first
      for (const [sid, { transport, server }] of sessions) {
        try {
          transport.close();
        } catch {
          // best-effort
        }
        sessions.delete(sid);
      }

      // Close HTTP server
      return new Promise((resolve) => {
        http.close(() => {
          process.stderr.write("[bac] HTTP server closed\n");
          resolve();
        });
        // Force-close after 5s
        setTimeout(() => {
          http.closeAllConnections?.();
          resolve();
        }, 5000);
      });
    },
  };
}