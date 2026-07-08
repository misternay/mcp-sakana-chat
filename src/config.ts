/**
 * Configuration for background-ai-chat MCP server.
 *
 * All settings come from environment variables with safe defaults.
 * Per spec §2.2 and §6: stdio local default needs no AUTH_KEY.
 */

import { homedir } from "node:os";
import { join } from "node:path";

function boolEnv(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export interface Config {
  /** Transport mode: "stdio" (default, no auth) or "http-sse" (requires AUTH_KEY). */
  readonly transportMode: "stdio" | "http-sse";
  /** Bearer token required only when HTTP/SSE transport is used. Empty = no auth (stdio). */
  readonly authKey: string;
  /** Port for HTTP/SSE transport. */
  readonly port: number;
  /** Host for HTTP/SSE transport. */
  readonly host: string;
  /** Run Chrome headless. Set false to debug login flow. */
  readonly browserHeadless: boolean;
  /** Idle timeout (ms) before auto-closing a browser context (keeps state.json). */
  readonly idleTimeoutMs: number;
  /** Hard cap on concurrent sessions. */
  readonly maxSessions: number;
  /** Root directory for all server data. */
  readonly dataDir: string;
  /** Directory for per-session state + persistent Chrome contexts. */
  readonly sessionsDir: string;
  /** Machine-wide ToS acknowledgment file. */
  readonly tosAckFile: string;
  /** Opt-in PII redaction on send/receive. Default off. */
  readonly redactPii: boolean;
  /** Allowed use cases (soft gate, logged). */
  readonly allowedUseCases: readonly string[];
  /** Sakana chat URL. */
  readonly sakanaUrl: string;
}

export function loadConfig(): Config {
  const dataDir = process.env.BAC_DATA_DIR ?? join(homedir(), ".background-ai-chat");
  const transportMode = (process.env.BAC_TRANSPORT ?? "stdio") as "stdio" | "http-sse";
  return {
    transportMode,
    authKey: process.env.BAC_AUTH_KEY ?? "",
    port: intEnv("BAC_PORT", 3456),
    host: process.env.BAC_HOST ?? "127.0.0.1",
    browserHeadless: boolEnv("BAC_BROWSER_HEADLESS", true),
    idleTimeoutMs: intEnv("BAC_IDLE_TIMEOUT_MS", 15 * 60 * 1000),
    maxSessions: intEnv("BAC_MAX_SESSIONS", 5),
    dataDir,
    sessionsDir: join(dataDir, "bac-sessions"),
    tosAckFile: join(dataDir, "bac-tos-ack.json"),
    redactPii: boolEnv("BAC_REDACT_PII", false),
    allowedUseCases: (process.env.BAC_ALLOWED_USE_CASES ?? "personal,internal")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    sakanaUrl: process.env.BAC_SAKANA_URL ?? "https://chat.sakana.ai/",
  };
}

/** ToS summary shown to the user before acknowledgment (spec §6.1). */
export const TOS_SUMMARY = [
  "Sakana Terms 5.8: No reverse engineering of the service.",
  "Sakana Terms 5.9: No competing product built on top of this access.",
  "This server is for personal/internal assistant use only.",
  "Cookies stay on this machine; message bodies are not logged.",
].join("\n");

export const TOS_VERSION = "2026-06-28";
