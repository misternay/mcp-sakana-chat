/**
 * MCP tool: session_close (spec §3.4)
 */

import { z } from "zod";
import type { SessionManager } from "../sessions/manager.js";

export const SessionCloseInputSchema = z.object({
  sessionId: z.string().min(1),
  keepHistory: z.boolean().default(true),
});

export const sessionCloseTool = {
  name: "session_close",
  description:
    "Close a Sakana chat session and release its browser context. " +
    "keepHistory:true (default) retains state.json + cookies for reuse.",
  schema: SessionCloseInputSchema,
  handler: async (manager: SessionManager, input: z.infer<typeof SessionCloseInputSchema>) => {
    const result = await manager.close(input.sessionId, input.keepHistory);
    return JSON.stringify(result, null, 2);
  },
};
