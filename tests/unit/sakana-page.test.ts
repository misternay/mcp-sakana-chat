/**
 * Unit tests: sakana-page.ts
 * Tests SakanaPage navigation and readiness detection with mocked Playwright Page.
 */

import { describe, it, expect, vi } from "vitest";
import { SakanaPage } from "../../src/browser/sakana-page.js";
import type { Page } from "playwright";

function makePage(allVisible = true): Page {
  const page: any = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn((_sel: string) => ({
      first: vi.fn(() =>
        allVisible
          ? { isVisible: vi.fn().mockResolvedValue(true), waitFor: vi.fn().mockResolvedValue(undefined) }
          : { isVisible: vi.fn().mockRejectedValue(new Error("not visible")), waitFor: vi.fn().mockRejectedValue(new Error("not found")) }
      ),
    })),
  };
  return page as Page;
}

describe("SakanaPage", () => {
  it("constructor stores the page", () => {
    const page = makePage();
    const sp = new SakanaPage(page);
    expect(sp.getPage()).toBe(page);
  });

  it("navigateAndWaitReady calls page.goto with correct URL", async () => {
    const page = makePage(true);
    const sp = new SakanaPage(page);
    await sp.navigateAndWaitReady("https://chat.sakana.ai/");
    expect(page.goto).toHaveBeenCalledWith(
      "https://chat.sakana.ai/",
      expect.objectContaining({ waitUntil: "domcontentloaded" })
    );
  });

  it("isReady returns true when a selector matches", async () => {
    const page = makePage(true);
    const sp = new SakanaPage(page);
    expect(await sp.isReady()).toBe(true);
  });

  it("isReady returns false when no selector matches", async () => {
    const page = makePage(false);
    const sp = new SakanaPage(page);
    expect(await sp.isReady()).toBe(false);
  });
});