# Design: Prepare background-ai-chat for npm Publishing

**Date:** 2026-06-29  
**Status:** Approved  
**Goal:** Make the TypeScript MCP server installable and runnable via `npx background-ai-chat`

---

## Overview

This MCP server is already well-structured with TypeScript, proper build setup, and a bin entry. The goal is to add npm publishing metadata and packaging configuration so users can install and run it via `npx` without manual git cloning or building.

**Scope:** This is a minimal packaging update. We keep all existing code, naming, environment variables, and functionality exactly as-is. No rebranding, no refactoring — just publishing prep.

---

## Current State

✅ TypeScript with proper `tsconfig.json`  
✅ Build setup (`npm run build` compiles to `dist/`)  
✅ `bin` entry in `package.json` pointing to `dist/index.js`  
✅ Shebang (`#!/usr/bin/env node`) in `src/index.ts`  
✅ Modern MCP SDK structure with tools  

**Gap:** Missing npm publishing metadata and package configuration.

---

## Changes

### 1. Package Metadata (`package.json`)

Add publishing fields while keeping existing structure:

```json
{
  "name": "background-ai-chat",
  "version": "0.1.0",
  "description": "Background AI Chat MCP server — drive chat.sakana.ai via headless Chrome through MCP tools (personal/internal use only)",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "background-ai-chat": "dist/index.js"
  },
  "author": "Ritthikiat Jindajak",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/misternay/mcp-sakana-chat.git"
  },
  "homepage": "https://github.com/misternay/mcp-sakana-chat#readme",
  "bugs": {
    "url": "https://github.com/misternay/mcp-sakana-chat/issues"
  },
  "keywords": [
    "mcp",
    "sakana",
    "ai",
    "chat",
    "mcp-server",
    "modelcontextprotocol",
    "background-ai-chat",
    "headless-chrome"
  ],
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=18.0.0"
  }
}
```

**New fields:**
- `author` — package owner
- `license` — MIT (standard for open source npm packages)
- `repository` — GitHub repo link for npm package page
- `homepage` — main documentation link
- `bugs` — where to report issues
- `keywords` — searchability on npm registry
- `files` — whitelist what gets published (excludes src/, tests/, etc.)

### 2. npm Ignore (`.npmignore`)

Create `.npmignore` to explicitly exclude development files:

```
# Source files (already compiled to dist/)
src/
tests/

# Development configs
tsconfig.json
vitest.config.ts
.vscode/
.idea/

# Git
.git*
.github/

# Build artifacts
*.tsbuildinfo
coverage/

# Logs
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db
```

**Why:** Keeps published package small (~50KB instead of ~500KB). Users only get `dist/`, `README.md`, and `LICENSE`.

### 3. License File (`LICENSE`)

Add MIT license (standard for npm packages):

```
MIT License

Copyright (c) 2026 Ritthikiat Jindajak

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 4. README Updates

Update installation instructions to emphasize `npx` as the primary method:

**Before Quick Start section, add:**

```markdown
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
```

**Update Claude Desktop Config section:**

```markdown
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
```

---

## What Stays the Same

**No code changes:**
- All TypeScript source files unchanged
- Environment variable names (`BAC_*`) unchanged
- Log prefixes (`[bac]`) unchanged
- Data directory (`~/.bagidea`) unchanged
- Server name (`"background-ai-chat"`) unchanged
- All tool names and APIs unchanged

**No refactoring:**
- No variable renaming
- No comment updates
- No architectural changes

This is purely a **packaging update** to make the existing code installable via npm.

---

## Publishing Process

### Pre-publish Checklist

1. **Build verification:**
   ```bash
   npm run build
   ```
   Ensure `dist/` is generated without errors.

2. **Test suite:**
   ```bash
   npm test
   ```
   All tests must pass.

3. **Package preview:**
   ```bash
   npm pack --dry-run
   ```
   Review what files will be included in the tarball.

4. **Local npx test:**
   ```bash
   npm pack
   npx ./background-ai-chat-0.1.0.tgz
   ```
   Verify the binary runs from the packed tarball.

5. **npm login:**
   ```bash
   npm login
   ```
   Authenticate to npm registry.

6. **Publish:**
   ```bash
   npm publish --access public
   ```

### Post-publish Verification

1. **Install test:**
   ```bash
   npx background-ai-chat@latest
   ```

2. **Check npm page:**
   Visit `https://www.npmjs.com/package/background-ai-chat`

3. **Verify Claude Desktop integration:**
   Update `claude_desktop_config.json` with npx command and test a tool call.

---

## Success Criteria

✅ Users can run `npx background-ai-chat` without git cloning  
✅ Package appears on npm registry with proper metadata  
✅ Published package is <100KB (only dist/ + docs)  
✅ Claude Desktop can launch the server via npx  
✅ All existing functionality works identically  

---

## Future Considerations (Out of Scope)

- Rebranding to `sakana-ai-chat` (requires env var migration, internal renaming)
- CI/CD for automated publishing
- Semantic versioning automation
- npm provenance/signatures

These can be addressed in future versions if needed.
