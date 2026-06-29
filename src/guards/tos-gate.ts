/**
 * ToS gate (spec §6.1).
 *
 * Machine-wide acknowledgment stored at <tosAckFile>.
 * First session_open must pass tosAccepted: true; subsequent calls reuse the ack.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { TOS_VERSION } from "../config.js";

export interface TosAck {
  tosAcceptedAt: string; // ISO-8601
  version: string;
}

export class TosGate {
  constructor(private readonly tosAckFile: string) {}

  async getAck(): Promise<TosAck | null> {
    try {
      const raw = await readFile(this.tosAckFile, "utf8");
      return JSON.parse(raw) as TosAck;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async isAccepted(): Promise<boolean> {
    const ack = await this.getAck();
    return ack !== null && ack.version === TOS_VERSION;
  }

  /**
   * Require ToS acknowledgment. If already acked on this machine, returns silently.
   * Otherwise the caller must pass tosAccepted: true, which records the ack.
   * Throws a typed error the tool layer can surface to the agent.
   */
  async require(tosAccepted: boolean): Promise<void> {
    const already = await this.isAccepted();
    if (already) return;
    if (!tosAccepted) {
      throw new TosNotAcceptedError(
        "Terms of Service not accepted. Pass tosAccepted: true on session_open after reviewing the ToS summary."
      );
    }
    const ack: TosAck = {
      tosAcceptedAt: new Date().toISOString(),
      version: TOS_VERSION,
    };
    await mkdir(dirname(this.tosAckFile), { recursive: true });
    await writeFile(this.tosAckFile, JSON.stringify(ack, null, 2), "utf8");
  }
}

export class TosNotAcceptedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TosNotAcceptedError";
  }
}
