/**
 * Sakana chat page wrapper (spec §2.2, §3.1).
 *
 * Navigates to chat.sakana.ai and waits for the chat input to be ready.
 * Selectors are heuristic — Sakana's DOM is not documented. If the UI changes,
 * update READY_SELECTORS. We do NOT parse undocumented protocol here (ADR-004,
 * §6.6); we only drive the real UI the user would drive.
 */

import type { Page } from "playwright";

/**
 * Candidate selectors for "chat is ready". Tried in order; first match wins.
 * Keep them generic (textarea/contenteditable) to survive minor UI churn.
 */
const READY_SELECTORS = [
  'textarea[placeholder*="Message" i]',
  'textarea[placeholder*="Ask" i]',
  'textarea[placeholder*="chat" i]',
  "form textarea",
  '[contenteditable="true"][role="textbox"]',
  'div[role="textbox"][contenteditable="true"]',
];

const READY_TIMEOUT_MS = 30_000;

export class SakanaPage {
  constructor(private readonly page: Page) {}

  getPage(): Page {
    return this.page;
  }

  async navigateAndWaitReady(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: READY_TIMEOUT_MS });

    // Cloudflare interstitial: wait for it to clear, then for a ready selector.
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let ready = false;
    while (Date.now() < deadline) {
      for (const sel of READY_SELECTORS) {
        const loc = this.page.locator(sel).first();
        try {
          await loc.waitFor({ state: "visible", timeout: 2_000 });
          ready = true;
          break;
        } catch {
          // try next selector
        }
      }
      if (ready) break;
      await this.page.waitForTimeout(500);
    }
    if (!ready) {
      throw new Error(
        "Sakana chat input not found within timeout. The page may have changed or Cloudflare is blocking."
      );
    }
  }

  async isReady(): Promise<boolean> {
    for (const sel of READY_SELECTORS) {
      try {
        const visible = await this.page.locator(sel).first().isVisible({ timeout: 1_000 });
        if (visible) return true;
      } catch {
        // continue
      }
    }
    return false;
  }

  /**
   * Create a Sakana conversation (exploration report §1, endpoint 1).
   *
   * Executed via `page.evaluate` so the fetch runs inside the real browser
   * context — same cookies (cf_clearance, sakana-chat), same origin, bypasses
   * Cloudflare's non-browser fingerprint check (ADR-001). We do NOT use Node's
   * fetch here.
   */
  async createConversation(opts: {
    inputs: string;
    enableThinking?: boolean;
    webSearch?: boolean;
  }): Promise<{ conversationId: string; systemMessageId: string }> {
    const body = {
      inputs: opts.inputs,
      enableThinking: opts.enableThinking ?? false,
      toneMode: "default",
      webSearchEnabled: opts.webSearch ?? true,
      agentId: "namazu",
    };
    const result = await this.page.evaluate(
      async (payload: { url: string; body: unknown }) => {
        const res = await fetch(payload.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload.body),
        });
        if (!res.ok) {
          throw new Error(`createConversation HTTP ${res.status}`);
        }
        return (await res.json()) as { conversationId: string; systemMessageId: string };
      },
      { url: new URL("/conversation", this.page.url()).toString(), body }
    );
    if (!result?.conversationId || !result?.systemMessageId) {
      throw new Error(
        `createConversation: unexpected response ${JSON.stringify(result)}`
      );
    }
    return result;
  }

  /**
   * Send a message to an existing Sakana conversation (report §1, endpoint 2).
   *
   * The endpoint expects multipart/form-data with a single field `data` whose
   * value is a JSON string. We build the FormData inside `page.evaluate`
   * (FormData/Blob exist in the browser context) and POST with
   * `credentials: "include"`. We tag the request with a custom `x-bac-msg`
   * header so stream-relay's matcher can identify this exact request among the
   * page's network traffic.
   *
   * The fetch drains the body in-page; stream-relay captures the same response
   * via `page.waitForResponse` to parse the NDJSON stream.
   */
  async sendMessage(opts: {
    conversationId: string;
    systemMessageId: string;
    inputs: string;
    userMessageId: string;
    enableThinking?: boolean;
    webSearch?: boolean;
  }): Promise<void> {
    const data = {
      inputs: opts.inputs,
      id: opts.systemMessageId,
      is_retry: false,
      is_continue: false,
      enableThinking: opts.enableThinking ?? false,
      toneMode: "default",
      webSearchEnabled: opts.webSearch ?? true,
      userMessageId: opts.userMessageId,
    };
    const url = new URL(
      `/conversation/${opts.conversationId}`,
      this.page.url()
    ).toString();

    await this.page.evaluate(
      async (payload: { url: string; data: unknown; tag: string }) => {
        const form = new FormData();
        form.append("data", JSON.stringify(payload.data));
        const res = await fetch(payload.url, {
          method: "POST",
          headers: { "x-bac-msg": payload.tag },
          credentials: "include",
          body: form,
        });
        if (!res.ok) {
          await res.text().catch(() => {});
          throw new Error(`sendMessage HTTP ${res.status}`);
        }
        await res.text();
      },
      { url, data, tag: opts.userMessageId }
    );
  }

  /**
   * Click the stop/interrupt button if present. Best-effort — selectors are
   * heuristic. Returns true if a stop control was found and clicked.
   */
  async clickStop(): Promise<boolean> {
    const stopSelectors = [
      'button[aria-label*="stop" i]',
      'button[aria-label*="Stop" i]',
      'button:has-text("Stop")',
      'button:has-text("停止")',
    ];
    for (const sel of stopSelectors) {
      const loc = this.page.locator(sel).first();
      try {
        if (await loc.isVisible({ timeout: 500 })) {
          await loc.click({ timeout: 2_000 });
          return true;
        }
      } catch {
        // try next
      }
    }
    return false;
  }
}
