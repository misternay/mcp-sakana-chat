/**
 * MCP tool: session_open (spec §3.1)
 */

import { z } from "zod";
import type { SessionManager } from "../sessions/manager.js";
import { TOS_SUMMARY } from "../config.js";

export const SessionOpenInputSchema = z.object({
  login: z.enum(["anonymous", "google", "email"]).default("anonymous"),
  headless: z.boolean().default(true),
  tosAccepted: z.boolean().default(false),
});

export const sessionOpenTool = {
  name: "session_open",
  description:
    "Open a persistent Sakana chat session backed by headless Chrome. " +
    "First call requires tosAccepted:true (machine-wide ack thereafter). " +
    "Returns sessionId + rate limit. Anonymous mode only in P1.",
  schema: SessionOpenInputSchema,
  handler: async (manager: SessionManager, input: z.infer<typeof SessionOpenInputSchema>) => {
    const result = await manager.open(input);
    return JSON.stringify(
      {
        ...result,
        tosSummary: TOS_SUMMARY,
      },
      null,
      2
    );
  },
};
