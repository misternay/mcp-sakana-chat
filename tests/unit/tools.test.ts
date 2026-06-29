/**
 * Unit tests: MCP tool handlers (session_open, session_close, session_list)
 *
 * Tests zod schema validation + handler output shape.
 */

import { describe, it, expect } from "vitest";

describe("session_open schema", () => {
  it("defaults: login=anonymous, headless=true, tosAccepted=false", async () => {
    const { SessionOpenInputSchema } = await import("../../src/tools/session_open.js");
    const parsed = SessionOpenInputSchema.parse({});
    expect(parsed).toEqual({ login: "anonymous", headless: true, tosAccepted: false });
  });

  it("accepts all fields explicitly set", async () => {
    const { SessionOpenInputSchema } = await import("../../src/tools/session_open.js");
    const parsed = SessionOpenInputSchema.parse({
      login: "google",
      headless: false,
      tosAccepted: true,
    });
    expect(parsed.login).toBe("google");
    expect(parsed.headless).toBe(false);
    expect(parsed.tosAccepted).toBe(true);
  });

  it("rejects invalid login value", async () => {
    const { SessionOpenInputSchema } = await import("../../src/tools/session_open.js");
    expect(() => SessionOpenInputSchema.parse({ login: "github" })).toThrow();
  });

  it("rejects non-boolean headless", async () => {
    const { SessionOpenInputSchema } = await import("../../src/tools/session_open.js");
    expect(() => SessionOpenInputSchema.parse({ headless: "yes" })).toThrow();
  });

  it("tool has name, description, schema, and handler", async () => {
    const { sessionOpenTool } = await import("../../src/tools/session_open.js");
    expect(sessionOpenTool.name).toBe("session_open");
    expect(typeof sessionOpenTool.description).toBe("string");
    expect(sessionOpenTool.description.length).toBeGreaterThan(10);
    expect(sessionOpenTool.schema).toBeDefined();
    expect(typeof sessionOpenTool.handler).toBe("function");
  });
});

describe("session_close schema", () => {
  it("requires non-empty sessionId", async () => {
    const { SessionCloseInputSchema } = await import("../../src/tools/session_close.js");
    expect(() => SessionCloseInputSchema.parse({ sessionId: "" })).toThrow();
    const parsed = SessionCloseInputSchema.parse({ sessionId: "bac_abc" });
    expect(parsed.sessionId).toBe("bac_abc");
  });

  it("defaults keepHistory to true", async () => {
    const { SessionCloseInputSchema } = await import("../../src/tools/session_close.js");
    const parsed = SessionCloseInputSchema.parse({ sessionId: "bac_abc" });
    expect(parsed.keepHistory).toBe(true);
  });

  it("accepts keepHistory=false", async () => {
    const { SessionCloseInputSchema } = await import("../../src/tools/session_close.js");
    const parsed = SessionCloseInputSchema.parse({ sessionId: "bac_abc", keepHistory: false });
    expect(parsed.keepHistory).toBe(false);
  });

  it("tool has correct metadata", async () => {
    const { sessionCloseTool } = await import("../../src/tools/session_close.js");
    expect(sessionCloseTool.name).toBe("session_close");
    expect(typeof sessionCloseTool.handler).toBe("function");
  });
});

describe("session_list schema", () => {
  it("accepts empty object only", async () => {
    const { SessionListInputSchema } = await import("../../src/tools/session_list.js");
    const parsed = SessionListInputSchema.parse({});
    expect(parsed).toEqual({});
  });

  it("rejects extra fields (strict mode)", async () => {
    const { SessionListInputSchema } = await import("../../src/tools/session_list.js");
    expect(() => SessionListInputSchema.parse({ foo: "bar" })).toThrow();
  });

  it("tool has correct metadata", async () => {
    const { sessionListTool } = await import("../../src/tools/session_list.js");
    expect(sessionListTool.name).toBe("session_list");
    expect(typeof sessionListTool.handler).toBe("function");
  });
});