# mcp-sakana-chat

MCP server that drives [chat.sakana.ai](https://chat.sakana.ai/) via headless Chrome — persistent sessions for AI assistant use.

> [!WARNING]
> **Status: Currently Non-Functional / Waiting for Improvements**
> `chat.sakana.ai` has updated its internal endpoints and introduced Cloudflare Turnstile bot protection, causing `chat_send` to fail with headless Chrome. This MCP is currently non-functional while awaiting updates/improvements.

## Installation

### Via npx (recommended — no install needed)
```bash
npx background-ai-chat
```

### Via npm global install
```bash
npm install -g background-ai-chat
background-ai-chat
```

### From source (for development)
```bash
git clone https://github.com/misternay/mcp-sakana-chat.git
cd mcp-sakana-chat
npm install && npm run build && npm start
```

## Claude Desktop Config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or equivalent:

```json
{
  "mcpServers": {
    "sakana-chat": {
      "command": "npx",
      "args": ["-y", "background-ai-chat"]
    }
  }
}
```

**Why `-y` flag:** Skips npm's install confirmation prompt, required for non-interactive usage.

**Alternative (if globally installed):**
```json
{
  "mcpServers": {
    "sakana-chat": {
      "command": "background-ai-chat"
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BAC_TRANSPORT` | `stdio` | `stdio` or `http-sse` |
| `BAC_AUTH_KEY` | `""` | Bearer token for HTTP/SSE |
| `BAC_PORT` | `3456` | HTTP/SSE port |
| `BAC_BROWSER_HEADLESS` | `true` | Run Chrome headless |
| `BAC_MAX_SESSIONS` | `5` | Max concurrent sessions |
| `BAC_DATA_DIR` | `~/.background-ai-chat` | Root data directory |

## MCP Tools

- **`session_open`** — Open a persistent chat session. `Input: { login?, headless?, tosAccepted? }` → `Output: { sessionId, conversationId, mode, rateLimit, tosSummary }`
- **`chat_send`** — Send a message with streaming token events. `Input: { sessionId, message }` → `Output: { reply, tokens[] }`
- **`chat_interrupt`** — Abort an in-flight message. `Input: { sessionId }` → `Output: { interrupted: true }`
- **`session_close`** — Close a session and release its browser. `Input: { sessionId, keepHistory? }` → `Output: { closed, messagesExchanged }`
- **`session_list`** — List all known sessions. `Input: {}` → `Output: { sessions[] }`

First call requires `tosAccepted: true`. Subsequent calls reuse the machine-wide ack.

## Guardrails

- **ToS gate** — machine-wide acknowledgment of Sakana Terms 5.8/5.9
- **Cookie isolation** — separate browser context per session
- **No message logging** — only metadata (sessionId, event, ms) to stderr
- **Personal/internal use only** — not a competing product

## Development

```bash
npm run build       # compile TypeScript
npm test            # run tests
npm run test:watch  # watch mode
```
