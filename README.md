# Background AI Chat MCP Server

MCP server that drives [chat.sakana.ai](https://chat.sakana.ai/) via headless Chrome — persistent sessions for AI assistant use.

**Status:** P1 skeleton complete (session_open/close/list + ToS gate). Chat send in P2.

## Quick Start

```bash
cd mcp-servers/background-ai-chat
npm install
npm run build
npm start
```

The server runs over stdio — connect it as an MCP tool provider in Claude Desktop, Cursor, or any MCP-client.

## Architecture

```
Agent (MCP client) --stdio--> MCP Server --CDP/Playwright--> Headless Chrome --HTTPS--> chat.sakana.ai
                                     |
                                     +--> ~/.bagidea/bac-sessions/ (per-session state + cookies)
```

- **Persistent Chrome per session** — cookies (cf_clearance, sakana-chat) survive across calls
- **JSON file store** — one `state.json` per session, no SQLite
- **Machine-wide ToS gate** — acknowledge once, stored at `~/.bagidea/bac-tos-ack.json`

## Configuration

All via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BAC_TRANSPORT` | `stdio` | `stdio` (no auth) or `http-sse` (P5) |
| `BAC_AUTH_KEY` | `""` | Bearer token for HTTP/SSE mode |
| `BAC_PORT` | `3456` | HTTP/SSE port |
| `BAC_HOST` | `127.0.0.1` | HTTP/SSE bind address |
| `BAC_BROWSER_HEADLESS` | `true` | Run Chrome headless |
| `BAC_IDLE_TIMEOUT_MS` | `900000` | Idle timeout before auto-close (15 min) |
| `BAC_MAX_SESSIONS` | `5` | Max concurrent sessions |
| `BAC_DATA_DIR` | `~/.bagidea` | Root data directory |
| `BAC_REDACT_PII` | `false` | Opt-in PII redaction (P4) |
| `BAC_ALLOWED_USE_CASES` | `personal,internal` | Comma-separated use cases |
| `BAC_SAKANA_URL` | `https://chat.sakana.ai/` | Sakana chat URL |

## MCP Tools

### `session_open`

Open a persistent Sakana chat session.

```
Input:  { login?: "anonymous"|"google"|"email", headless?: boolean, tosAccepted?: boolean }
Output: { sessionId, conversationId, mode, rateLimit, tosSummary }
```

First call requires `tosAccepted: true`. Subsequent calls reuse the machine-wide ack.

### `session_close`

Close a session and release its browser context.

```
Input:  { sessionId: string, keepHistory?: boolean }
Output: { closed: true, messagesExchanged: number }
```

`keepHistory: true` (default) retains `state.json` + cookies for later reuse.

### `session_list`

List all known sessions.

```
Input:  {}
Output: { sessions: Array<{ sessionId, mode, lastSeen, active, messagesExchanged }> }
```

### Coming in P2–P5

- `chat_send` — streaming chat with token events
- `chat_interrupt` — abort in-flight message
- Rate limiting, content filter, HTTP/SSE transport

## Development

```bash
npm run dev          # watch mode (tsc --watch)
npm test             # run unit + e2e tests
npm run test:watch   # watch mode
npm run test:coverage # with coverage report
```

### Test structure

```
tests/
├── unit/
│   ├── config.test.ts        # Env config parsing
│   ├── tos-gate.test.ts      # ToS acknowledgment
│   ├── store.test.ts         # Session JSON CRUD
│   ├── manager.test.ts       # Session lifecycle
│   ├── tools.test.ts         # Zod schemas + handler contracts
│   ├── pool.test.ts          # Browser pool (mocked Playwright)
│   └── sakana-page.test.ts   # Page object (mocked Playwright)
├── e2e/
│   └── server.test.ts        # MCP request pipeline
└── fixtures/
    └── mock-sakana.html      # Mock Sakana UI for browser tests
```

## Spec

Full specification: `docs/specs/background-ai-chat-mcp.md`

Key ADRs:
- **ADR-001:** Playwright/CDP instead of fetch (Cloudflare blocks non-browser)
- **ADR-002:** stdio default, no auth key required
- **ADR-003:** 1 persistent Chrome context per session
- **ADR-004:** Soft use-case gate, no hard competing-product block

## Guardrails

- **ToS Gate:** Machine-wide acknowledgment of Sakana Terms 5.8/5.9
- **Cookie Isolation:** Separate browser context per session
- **No message logging:** Only metadata (sessionId, event, ms) to stderr
- **Personal/internal use only:** Not a competing product

## Handoff Notes

For the backend developer taking over:

1. **P1 is stable** — session lifecycle works; tests pass; mocks are in place
2. **P2 (chat_send)** — needs `src/tools/chat_send.ts` + `page.evaluate` to POST to Sakana conversation endpoint. Review ADR-004 before parsing response format.
3. **P3 (streaming)** — needs `src/browser/stream-relay.ts` to intercept NDJSON and emit MCP token events
4. **Browser pool is the critical path** — `pool.ts` manages persistent contexts; don't change its lifecycle without updating `manager.ts`
5. **Tests use vitest** — add `tests/unit/chat_send.test.ts` when implementing P2
6. **Node >= 18** required; macOS primary target, Linux supported