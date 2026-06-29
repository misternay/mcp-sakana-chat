/**
 * Auth guard for HTTP/SSE transport (spec §1, §6).
 *
 * When transportMode === "http-sse", every request must carry a valid
 * Bearer token matching BAC_AUTH_KEY. The transport layer calls
 * authenticate() before routing to the MCP message handler.
 *
 * Uses timing-safe comparison to prevent timing side-channel leaks.
 */

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

const BEARER_RE = /^Bearer\s+(.+)$/i;

export class AuthGuard {
  private readonly keyBytes: Buffer | null;

  constructor(authKey: string) {
    this.keyBytes = authKey ? Buffer.from(authKey, "utf8") : null;
  }

  /** True when no auth is configured (stdio mode or empty key). */
  get isDisabled(): boolean {
    return this.keyBytes === null || this.keyBytes.length === 0;
  }

  /**
   * Extract and validate the Bearer token from an incoming HTTP request.
   * Throws if auth is required and the token is missing, malformed, or wrong.
   */
  authenticate(req: IncomingMessage): void {
    if (this.isDisabled) return;

    const header = req.headers.authorization;
    if (!header) {
      throw new AuthError("Missing Authorization header. Pass Bearer <token>.");
    }

    const match = BEARER_RE.exec(header);
    if (!match) {
      throw new AuthError(
        "Malformed Authorization header. Use: Bearer <token>"
      );
    }

    const supplied = Buffer.from(match[1], "utf8");

    // Pad to equal length for timing-safe comparison
    const targetLen = Math.max(supplied.length, this.keyBytes!.length);
    const a = Buffer.alloc(targetLen, 0);
    const b = Buffer.alloc(targetLen, 0);
    supplied.copy(a);
    this.keyBytes!.copy(b);

    if (!timingSafeEqual(a, b)) {
      throw new AuthError("Invalid auth token.");
    }
  }

  /**
   * Return the number of bytes in the configured key (0 if disabled).
   * Useful for logging / health check (never log the key itself).
   */
  get keyLength(): number {
    return this.keyBytes?.length ?? 0;
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}