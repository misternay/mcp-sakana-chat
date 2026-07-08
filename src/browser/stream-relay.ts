/**
 * Sakana NDJSON stream parser (spec §3.2, exploration report §2).
 *
 * Sakana's /conversation/{id} endpoint returns a streamed response body of
 * newline-delimited JSON objects. Two quirks we must handle:
 *
 *   1. Null-byte padding between/within records (Nida discovered this).
 *      We strip all 0x00 bytes before splitting on newlines.
 *   2. Chunks arrive at arbitrary byte boundaries — a single `data` chunk may
 *      contain partial JSON, multiple records, or both. We buffer and emit one
 *      parsed event per complete line.
 *
 * We do NOT parse undocumented fields beyond what the UI itself consumes
 * (ADR-004, §6.6). The event shapes below are the ones Sakana emits to its own
 * front-end, observed in the exploration report.
 */


export type SakanaStreamEvent =
  | { type: "createdMessage"; messageId: string }
  | { type: "status"; status: "started" | "keepAlive" | "thinking" | string }
  | { type: "stream"; token: string }
  | { type: "title"; title: string }
  | { type: "finalAnswer"; text: string; interrupted: boolean }
  | { type: "error"; code: string; message: string }
  | { type: "unknown"; raw: unknown };

/** A raw Sakana JSONL record (loosely typed — we only read known fields). */
type SakanaRecord = Record<string, unknown>;

/**
 * Parse a complete NDJSON record into a typed event.
 * Exported for unit testing.
 */
export function parseRecord(record: SakanaRecord): SakanaStreamEvent {
  const t = record["type"];
  switch (t) {
    case "createdMessage":
      return { type: "createdMessage", messageId: String(record["messageId"] ?? "") };
    case "status":
      return { type: "status", status: String(record["status"] ?? "") };
    case "stream":
      return { type: "stream", token: String(record["token"] ?? "") };
    case "title":
      return { type: "title", title: String(record["title"] ?? "") };
    case "finalAnswer":
      return {
        type: "finalAnswer",
        text: String(record["text"] ?? ""),
        interrupted: Boolean(record["interrupted"]),
      };
    case "error":
      return {
        type: "error",
        code: String(record["code"] ?? "unknown"),
        message: String(record["message"] ?? ""),
      };
    default:
      return { type: "unknown", raw: record };
  }
}

/**
 * Incremental NDJSON-over-bytes parser.
 *
 * Feed it raw response chunks via `push()`; it yields one SakanaStreamEvent per
 * complete line. Call `end()` to flush; a trailing partial line is surfaced as
 * an `unknown` event so we never silently drop data (spec §5: no silent failures).
 *
 * Null-byte padding is stripped before line splitting.
 */
export class NdjsonStreamParser {
  private buffer = "";

  /**
   * Parse a chunk of bytes. Returns complete events found in this chunk.
   * Partial trailing data is retained in the buffer for the next push/end.
   */
  push(chunk: Buffer | string): SakanaStreamEvent[] {
    // Strip null-byte padding (0x00) that Sakana inserts between records.
    // Only allocate a filtered buffer when null bytes are actually present.
    const bytes = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
    const hasNulls = bytes.includes(0x00);
    const cleaned = hasNulls
      ? Buffer.from(bytes.filter((b) => b !== 0x00)).toString("utf8")
      : bytes.toString("utf8");
    this.buffer += cleaned;
    return this.drain(false);
  }

  /** Flush the buffer. Any trailing partial line becomes an `unknown` event. */
  end(): SakanaStreamEvent[] {
    return this.drain(true);
  }

  private drain(final: boolean): SakanaStreamEvent[] {
    const events: SakanaStreamEvent[] = [];
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      events.push(this.parseLine(line));
    }
    if (final && this.buffer.trim()) {
      events.push(this.parseLine(this.buffer.trim()));
      this.buffer = "";
    }
    return events;
  }

  private parseLine(line: string): SakanaStreamEvent {
    try {
      const record = JSON.parse(line) as SakanaRecord;
      return parseRecord(record);
    } catch {
      // Not valid JSON — surface rather than swallow (§5).
      return { type: "unknown", raw: line };
    }
  }
}
