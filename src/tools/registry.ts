/**
 * Shared tool registry for all MCP transports (spec §2, §3).
 *
 * Single source of truth for the tool list. Both stdio (index.ts) and
 * HTTP/SSE (transport/http-sse.ts) import from here so they never drift.
 */

import { z } from "zod";
import type { SessionManager } from "../sessions/manager.js";
import { sessionOpenTool, SessionOpenInputSchema } from "../tools/session_open.js";
import { sessionCloseTool, SessionCloseInputSchema } from "../tools/session_close.js";
import { sessionListTool, SessionListInputSchema } from "../tools/session_list.js";
import {
  chatSendTool,
  ChatSendInputSchema,
  type ChatStreamLogPayload,
} from "../tools/chat_send.js";
import { chatInterruptTool, ChatInterruptInputSchema } from "../tools/chat_interrupt.js";

export interface ToolDeps {
  notify?: (payload: ChatStreamLogPayload) => void;
  signal?: AbortSignal;
}

export interface ToolEntry {
  name: string;
  description: string;
  schema: z.ZodType<any>;
  handler: (manager: SessionManager, input: any, deps?: ToolDeps) => Promise<string>;
}

export const TOOLS: ToolEntry[] = [
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
