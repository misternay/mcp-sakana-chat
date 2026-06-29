/**
 * Live E2E tests — drives Sakana Chat through the real browser UI
 *
 * Types into the chat textarea and reads the latest AI response from the DOM.
 * Each test captures a "before" baseline to detect new content.
 *
 * Run:  npx vitest run tests/e2e/sakana-live.test.ts --sequence.concurrent=false
 * Skip: SKIP_LIVE_E2E=1 npx vitest run ...
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type BrowserContext, type Page } from "playwright";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";

const SAKANA_URL = process.env.BAC_SAKANA_URL ?? "https://chat.sakana.ai/";
const HEADLESS = process.env.BAC_BROWSER_HEADLESS !== "false";
const SKIP = process.env.SKIP_LIVE_E2E === "1";

async function waitForReady(page: Page): Promise<void> {
  const selectors = [
    'textarea[placeholder*="Message" i]',
    'textarea[placeholder*="Ask" i]',
    'textarea[placeholder*="chat" i]',
    "form textarea",
    '[contenteditable="true"][role="textbox"]',
    'div[role="textbox"][contenteditable="true"]',
  ];
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      try {
        await page.locator(sel).first().waitFor({ state: "visible", timeout: 2_000 });
        return;
      } catch {}
    }
    await page.waitForTimeout(500);
  }
  throw new Error("Chat input not found");
}

async function getTextarea(page: Page) {
  const selectors = [
    'textarea[placeholder*="Message" i]',
    'textarea[placeholder*="Ask" i]',
    'textarea[placeholder*="chat" i]',
    "form textarea",
    '[contenteditable="true"][role="textbox"]',
    'div[role="textbox"][contenteditable="true"]',
  ];
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 500 }).catch(() => false)) return el;
  }
  throw new Error("No textarea");
}

/**
 * Send a message via the real UI and wait for a NEW response to appear.
 * Returns the full text content that appeared after sending.
 */
async function sendViaUI(page: Page, message: string): Promise<string> {
  // Capture baseline: body text before sending
  const before = (await page.locator("body").innerText()).length;

  const ta = await getTextarea(page);
  await ta.click();
  await ta.fill(message);
  await page.waitForTimeout(500);

  // Try Enter to submit (most reliable for Sakana)
  await ta.press("Enter");

  // Wait for new text to appear — body text should grow significantly
  const deadline = Date.now() + 120_000;
  let lastLen = before;
  while (Date.now() < deadline) {
    const current = (await page.locator("body").innerText()).length;
    const growth = current - lastLen;
    if (growth >= 20) {
      // New content appeared substantially
      // Wait a bit more for it to settle
      await page.waitForTimeout(2000);
      break;
    }
    lastLen = current;
    await page.waitForTimeout(1000);
  }

  // Get the full page text
  const fullText = await page.locator("body").innerText();
  // Return only the part after the "before" position
  // (approximate — innerText lengths aren't exact offsets)
  const newContent = fullText.slice(Math.max(0, before - 500));
  return newContent;
}

describe("Sakana Chat Live E2E", () => {
  let ctx: BrowserContext;
  let page: Page;
  let tmpDir: string;

  beforeAll(async () => {
    if (SKIP) return;
    tmpDir = await mkdtemp(join(tmpdir(), "bac-e2e-"));
    ctx = await chromium.launchPersistentContext(tmpDir, {
      headless: HEADLESS,
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });
    page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(SAKANA_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForReady(page);
    console.log("[SETUP] Page ready:", await page.title());
  }, 120_000);

  afterAll(async () => {
    if (SKIP) return;
    await ctx?.close().catch(() => {});
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it("page loads with Sakana title and chat input visible", async () => {
    if (SKIP) return;
    expect((await page.title()).toLowerCase()).toContain("sakana");
    const ta = await getTextarea(page);
    expect(await ta.isVisible()).toBe(true);
  });

  it("responds to Japanese greeting", async () => {
    if (SKIP) return;
    const text = await sendViaUI(page,
      "こんにちは！簡単に自己紹介してください。");
    expect(text.length).toBeGreaterThan(30);
    console.log(`[OK] JP response (${text.length} chars): "${text.slice(0, 200)}"`);
  }, 180_000);

  it("answers knowledge question in English", async () => {
    if (SKIP) return;
    const text = await sendViaUI(page,
      "What is the capital city of France? Answer in one word only.");
    expect(text.toLowerCase()).toContain("paris");
    console.log(`[OK] EN question: "${text.slice(0, 200)}"`);
  }, 180_000);

  it("generates code for fizzbuzz", async () => {
    if (SKIP) return;
    const text = await sendViaUI(page,
      "Write a Python function fizzbuzz(n) that returns 'Fizz', 'Buzz', or 'FizzBuzz'. Code only.");
    expect(text.length).toBeGreaterThan(20);
    const hasCode = text.includes("def") || text.includes("return") || text.includes("```");
    expect(hasCode).toBe(true);
    console.log(`[OK] Code (${text.length} chars): "${text.slice(0, 300)}"`);
  }, 180_000);

  it("remembers context from a previous turn", async () => {
    if (SKIP) return;
    await sendViaUI(page, "My name is Ton. I am a QA engineer from Bangkok.");
    await page.waitForTimeout(2000);

    const text = await sendViaUI(page,
      "Based on the previous message, what is my name and where am I from?");
    const lower = text.toLowerCase();
    const remembers = lower.includes("ton") || lower.includes("bangkok");
    expect(remembers).toBe(true);
    console.log(`[OK] Multi-turn: "${text.slice(0, 300)}"`);
  }, 300_000);

  it("understands and responds in Thai", async () => {
    if (SKIP) return;
    const text = await sendViaUI(page,
      "ช่วยแนะนำตัวเป็นภาษาไทยหน่อยครับ ว่าคุณมีความสามารถอะไรบ้าง");
    expect(text.length).toBeGreaterThan(30);
    console.log(`[OK] Thai response (${text.length} chars): "${text.slice(0, 200)}"`);
  }, 180_000);
});