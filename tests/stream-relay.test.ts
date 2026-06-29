/**
 * Unit tests for the NDJSON stream parser (spec §3.2, stream-relay.ts).
 *
 * These are pure parser tests — no Playwright, no network. They cover the
 * quirks Nida discovered: null-byte padding and arbitrary chunk boundaries.
 */
import { describe, it, expect } from "vitest";
import {
  NdjsonStreamParser,
  parseRecord,
  type SakanaStreamEvent,
} from "../src/browser/stream-relay.js";

describe("parseRecord", () => {
  it("parses a createdMessage event", () => {
    expect(parseRecord({ type: "createdMessage", messageId: "m1" })).toEqual({
      type: "createdMessage",
      messageId: "m1",
    });
  });

  it("parses a stream token event", () => {
    expect(parseRecord({ type: "stream", token: "hello" })).toEqual({
      type: "stream",
      token: "hello",
    });
  });

  it("parses a finalAnswer event with interrupted flag", () => {
    expect(
      parseRecord({ type: "finalAnswer", text: "full", interrupted: true })
    ).toEqual({ type: "finalAnswer", text: "full", interrupted: true });
  });

  it("parses an error event, defaulting code to unknown", () => {
    expect(parseRecord({ type: "error", message: "boom" })).toEqual({
      type: "error",
      code: "unknown",
      message: "boom",
    });
  });

  it("maps unknown types to an unknown event (no silent drop)", () => {
    expect(parseRecord({ type: "futureEvent", foo: 1 })).toEqual({
      type: "unknown",
      raw: { type: "futureEvent", foo: 1 },
    });
  });

  it("coerces missing fields to empty strings rather than undefined", () => {
    expect(parseRecord({ type: "stream" })).toEqual({ type: "stream", token: "" });
  });
});

describe("NdjsonStreamParser", () => {
  it("parses a single complete line", () => {
    const p = new NdjsonStreamParser();
    const events = p.push('{"type":"stream","token":"hi"}\n');
    expect(events).toEqual([{ type: "stream", token: "hi" }]);
  });

  it("parses multiple lines in one chunk", () => {
    const p = new NdjsonStreamParser();
    const chunk =
      '{"type":"status","status":"started"}\n' +
      '{"type":"stream","token":"a"}\n' +
      '{"type":"stream","token":"b"}\n';
    const events = p.push(chunk);
    expect(events.map((e) => e.type)).toEqual(["status", "stream", "stream"]);
  });

  it("buffers a partial line across pushes", () => {
    const p = new NdjsonStreamParser();
    expect(p.push('{"type":"stream","tok')).toEqual([]);
    const events = p.push('en":"x"}\n');
    expect(events).toEqual([{ type: "stream", token: "x" }]);
  });

  it("strips null-byte padding between records", () => {
    const p = new NdjsonStreamParser();
    // Sakana inserts 0x00 bytes between records (Nida's discovery).
    const chunk = Buffer.concat([
      Buffer.from('{"type":"status","status":"keepAlive"}'),
      Buffer.from([0x00, 0x00]),
      Buffer.from("\n"),
      Buffer.from('{"type":"stream","token":"t"}'),
      Buffer.from([0x00]),
      Buffer.from("\n"),
    ]);
    const events = p.push(chunk);
    expect(events).toEqual([
      { type: "status", status: "keepAlive" },
      { type: "stream", token: "t" },
    ]);
  });

  it("strips null bytes inside the JSON itself", () => {
    const p = new NdjsonStreamParser();
    // A null byte inside a token value would break JSON.parse; stripping first
    // means we recover the intended record. (Sakana's padding is not semantic.)
    const chunk = Buffer.concat([
      Buffer.from('{"type":"stream","token":"'),
      Buffer.from([0x00]),
      Buffer.from('ok"}\n'),
    ]);
    const events = p.push(chunk);
    expect(events).toEqual([{ type: "stream", token: "ok" }]);
  });

  it("end() flushes a trailing partial line as unknown (no silent drop)", () => {
    const p = new NdjsonStreamParser();
    p.push('{"type":"stream","token":"ok"}\n');
    p.push('{"type":"finalAnsw'); // incomplete, no newline
    const events = p.end();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("unknown");
  });

  it("end() on an empty buffer yields nothing", () => {
    const p = new NdjsonStreamParser();
    expect(p.end()).toEqual([]);
  });

  it("ignores blank lines between records", () => {
    const p = new NdjsonStreamParser();
    const events = p.push(
      '{"type":"status","status":"started"}\n\n\n{"type":"stream","token":"x"}\n'
    );
    expect(events.map((e) => e.type)).toEqual(["status", "stream"]);
  });

  it("surfaces invalid JSON as unknown rather than throwing", () => {
    const p = new NdjsonStreamParser();
    const events = p.push("not-json-at-all\n");
    expect(events).toEqual([{ type: "unknown", raw: "not-json-at-all" }]);
  });

  it("handles a realistic Sakana stream sequence", () => {
    const p = new NdjsonStreamParser();
    const body =
      '{"type":"createdMessage","messageId":"m0"}\n' +
      '{"type":"status","status":"keepAlive"}\n' +
      '{"type":"status","status":"started"}\n' +
      '{"type":"stream","token":"Hello"}\n' +
      '{"type":"stream","token":" world"}\n' +
      '{"type":"title","title":"Greeting"}\n' +
      '{"type":"finalAnswer","text":"Hello world","interrupted":false}\n';
    const events: SakanaStreamEvent[] = [];
    for (const e of p.push(body)) events.push(e);
    for (const e of p.end()) events.push(e);
    expect(events.map((e) => e.type)).toEqual([
      "createdMessage",
      "status",
      "status",
      "stream",
      "stream",
      "title",
      "finalAnswer",
    ]);
    const final = events.find((e) => e.type === "finalAnswer");
    expect(final).toEqual({ type: "finalAnswer", text: "Hello world", interrupted: false });
  });
});
