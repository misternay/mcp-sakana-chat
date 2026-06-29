/**
 * MCP tool: session_list (spec §3.5)
 */

import { z } from "zod";
import type { SessionManager } from "../sessions/manager.js";

export const SessionListInputSchema = z.object({}).strict();

export const sessionListTool = {
  name: "session_list",
  description: "List all known Sakana chat sessions (active and idle).",
  schema: SessionListInputSchema,
  handler: async (manager: SessionManager, _input: z.infer<typeof SessionListInputSchema>) => {
    const sessions = await manager.list();
    const view = sessions.map((s) => ({
      sessionId: s.sessionId,
      mode: s.mode,
      lastSeen: s.lastSeen,
      active: manager.pool.isAcquired(s.sessionId),
      messagesExchanged: s.messagesExchanged,
    }));
    return JSON.stringify({ sessions: view }, null, 2);
  },
};
