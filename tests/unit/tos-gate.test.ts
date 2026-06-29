/**
 * Unit tests: tos-gate.ts
 *
 * Spec 6.1: machine-wide ToS acknowledgment.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeFile, mkdir } from "node:fs/promises";

async function importFresh() {
  const mod = await import("../../src/guards/tos-gate.js");
  return mod;
}

let tmpDir: string;

beforeEach(async () => {
  vi.resetModules();
  tmpDir = await mkdtemp(join(tmpdir(), "bac-test-tos-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("TosGate", () => {
  it("getAck returns null when file does not exist", async () => {
    const { TosGate } = await importFresh();
    const gate = new TosGate(join(tmpDir, "tos.json"));
    expect(await gate.getAck()).toBeNull();
  });

  it("isAccepted returns false when no ack exists", async () => {
    const { TosGate } = await importFresh();
    const gate = new TosGate(join(tmpDir, "tos.json"));
    expect(await gate.isAccepted()).toBe(false);
  });

  it("getAck reads a valid acknowledgment file", async () => {
    const { TosGate } = await importFresh();
    const ackFile = join(tmpDir, "tos.json");
    await mkdir(tmpDir, { recursive: true });
    await writeFile(
      ackFile,
      JSON.stringify({ tosAcceptedAt: "2026-06-28T00:00:00Z", version: "2026-06-28" }),
      "utf8"
    );

    const gate = new TosGate(ackFile);
    const ack = await gate.getAck();
    expect(ack).not.toBeNull();
    expect(ack!.version).toBe("2026-06-28");
    expect(ack!.tosAcceptedAt).toBe("2026-06-28T00:00:00Z");
  });

  it("isAccepted returns true when version matches TOS_VERSION", async () => {
    const { TosGate } = await importFresh();
    const ackFile = join(tmpDir, "tos.json");
    const gate = new TosGate(ackFile);

    // Use require() to write a valid ack, then verify isAccepted()
    await gate.require(true);
    expect(await gate.isAccepted()).toBe(true);

    const ack = await gate.getAck();
    expect(ack!.version).toBe("2026-06-28");
  });

  it("isAccepted returns false when version mismatches", async () => {
    const { TosGate } = await importFresh();
    const ackFile = join(tmpDir, "tos.json");
    await mkdir(tmpDir, { recursive: true });
    await writeFile(
      ackFile,
      JSON.stringify({ tosAcceptedAt: "2026-01-01T00:00:00Z", version: "old-version" }),
      "utf8"
    );

    const gate = new TosGate(ackFile);
    expect(await gate.isAccepted()).toBe(false);
  });

  it("require() throws TosNotAcceptedError when not yet acked and tosAccepted=false", async () => {
    const { TosGate, TosNotAcceptedError } = await importFresh();
    const gate = new TosGate(join(tmpDir, "tos.json"));
    await expect(gate.require(false)).rejects.toThrow(TosNotAcceptedError);
  });

  it("require() writes ack when tosAccepted=true", async () => {
    const { TosGate } = await importFresh();
    const ackFile = join(tmpDir, "tos.json");
    const gate = new TosGate(ackFile);
    await gate.require(true);

    expect(await gate.isAccepted()).toBe(true);
    const ack = await gate.getAck();
    expect(ack!.tosAcceptedAt).toBeTruthy();
  });

  it("require() succeeds silently when already accepted", async () => {
    const { TosGate } = await importFresh();
    const ackFile = join(tmpDir, "tos.json");
    const gate = new TosGate(ackFile);
    await gate.require(true);

    // Second call should not throw even with false
    await expect(gate.require(false)).resolves.toBeUndefined();
  });
});