#!/usr/bin/env node
/**
 * Background AI Chat MCP Server — entry.
 *
 * Drives chat.sakana.ai via headless Chrome through MCP tools.
 * Personal/internal assistant use only (spec §0, §6).
 *
 * Transport selection (spec §1, P5):
 *   BAC_TRANSPORT=stdio    (default) — stdio, no auth, local use
 *   BAC_TRANSPORT=http-sse           — HTTP/SSE, requires BAC_AUTH_KEY
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";

import { loadConfig } from "./config.js";
import { SessionManager } from "./sessions/manager.js";
import { sessionOpenTool, SessionOpenInputSchema } from "./tools/session_open.js";
import { sessionCloseTool, SessionCloseInputSchema } from "./tools/session_close.js";
import { sessionListTool, SessionListInputSchema } from "./tools/session_list.js";
import {
  chatSendTool,
  ChatSendInputSchema,
  type ChatStreamLogPayload,
} from "./tools/chat_send.js";
import { chatInterruptTool, ChatInterruptInputSchema } from "./tools/chat_interrupt.js";
import { createHttpsseTransport } from "./transport/http-sse.js";

interface ToolDeps {
  notify?: (payload: ChatStreamLogPayload) => void;
  signal?: AbortSignal;
}

interface ToolEntry {
  name: string;
  description: string;
  schema: any;
  handler: (manager: SessionManager, input: any, deps?: ToolDeps) => Promise<string>;
}

const TOOLS: ToolEntry[] = [
  {
    name: sessionOpenTool.name,
    description: sessionOpenTool.description,
    schema: SessionOpenInputSchema,
    handler: sessionOpenTool.handler,
  },
  {
    name: sessionCloseTool.name,
    description: sessionCloseTool.description,
    schema: SessionCloseInputSchema,
    handler: sessionCloseTool.handler,
  },
  {
    name: sessionListTool.name,
    description: sessionListTool.description,
    schema: SessionListInputSchema,
    handler: sessionListTool.handler,
  },
  {
    name: chatSendTool.name,
    description: chatSendTool.description,
    schema: ChatSendInputSchema,
    handler: chatSendTool.handler,
  },
  {
    name: chatInterruptTool.name,
    description: chatInterruptTool.description,
    schema: ChatInterruptInputSchema,
    handler: chatInterruptTool.handler,
  },
];

const config = loadConfig();
const manager = new SessionManager(config);

function createMcpServer(): Server {
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
    try {
      const entry = TOOLS.find((t) => t.name === name);
      if (!entry) {
        throw new Error(
          `Unknown tool: ${name}. Available: ${TOOLS.map((t) => t.name).join(", ")}`
        );
      }
      const input = entry.schema.parse(args ?? {});
      // Wire P3 streaming: each chat_send event becomes an MCP logging
      // notification. Only chat_send consumes notify; other tools ignore it.
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

async function runStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[bac] stdio transport connected\n");
}

async function main() {
  if (config.transportMode === "http-sse") {
    if (!config.authKey) {
      process.stderr.write(
        "[bac] WARNING: HTTP/SSE transport without BAC_AUTH_KEY — accepting all requests\n"
      );
    }
    const httpTransport = createHttpsseTransport(config, manager);
    await httpTransport.start();

    const shutdown = async (signal: string) => {
      process.stderr.write(`[bac] ${signal} received, shutting down\n`);
      await httpTransport.shutdown();
      await manager.shutdown();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  } else {
    await runStdio();
    const shutdown = async (signal: string) => {
      process.stderr.write(`[bac] ${signal} received, shutting down\n`);
      await manager.shutdown();
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
  }
}

main().catch((err) => {
  process.stderr.write(`[bac] fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
