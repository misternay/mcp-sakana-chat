/**
 * MCP tool: chat_interrupt (spec §3.3).
 *
 * Best-effort interrupt of an in-flight chat_send. The primary cancellation
 * path is the AbortSignal held by the chat_send handler; this tool is the
 * UI-level complement — it clicks Sakana's stop button and returns whatever
 * partial text is visible.
 */

import { z } from "zod";
import type { SessionManager } from "../sessions/manager.js";

export const ChatInterruptInputSchema = z.object({
  sessionId: z.string().min(1),
});

export const chatInterruptTool = {
  name: "chat_interrupt",
  description:
    "Interrupt an in-flight Sakana chat send. Clicks the page stop button " +
    "and returns partial text. The stream also terminates via the AbortSignal " +
    "on the original chat_send call.",
  schema: ChatInterruptInputSchema,
  handler: async (
    manager: SessionManager,
    input: z.infer<typeof ChatInterruptInputSchema>
  ) => {
    const result = await manager.interrupt(input.sessionId);
    return JSON.stringify(result, null, 2);
  },
};
