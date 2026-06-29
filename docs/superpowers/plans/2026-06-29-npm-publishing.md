# npm Publishing Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare background-ai-chat MCP server for npm publishing so users can install via `npx background-ai-chat`

**Architecture:** Add npm publishing metadata to package.json, create .npmignore for package optimization, add MIT LICENSE, and update README with npx installation instructions. No code changes — purely packaging configuration.

**Tech Stack:** npm, package.json metadata, MIT license

## Global Constraints

- Node.js >= 18.0.0
- Keep all existing code unchanged (no refactoring)
- Package must include only: dist/, README.md, LICENSE
- Published package target size: <100KB

---

## Task 1: Add npm Publishing Metadata

**Files:**
- Modify: `package.json:1-34`

**Interfaces:**
- Consumes: Existing package.json structure
- Produces: package.json with author, license, repository, homepage, bugs, keywords, files fields

- [ ] **Step 1: Update package.json with publishing metadata**

Open `package.json` and add the following fields after line 9 (after `"bin": {...}`):

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
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e:live": "vitest run tests/e2e/sakana-live.test.ts --test-timeout=300000"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^0.5.0",
    "playwright": "^1.45.0",
    "zod": "^3.22.4",
    "zod-to-json-schema": "^3.25.2"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@vitest/coverage-v8": "^4.1.9",
    "typescript": "^5.3.3",
    "vitest": "^4.1.9"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 2: Verify package.json is valid JSON**

Run: `cat package.json | jq empty`
Expected: No output (valid JSON)

- [ ] **Step 3: Commit package.json changes**

```bash
git add package.json
git commit -m "chore: add npm publishing metadata

- Add author, license, repository, homepage, bugs fields
- Add keywords for npm discoverability
- Add files whitelist for published package"
```

---

## Task 2: Create npm Ignore File

**Files:**
- Create: `.npmignore`

**Interfaces:**
- Consumes: None
- Produces: .npmignore file that excludes development files from npm package

- [ ] **Step 1: Create .npmignore file**

Create `.npmignore` in project root with this content:

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

- [ ] **Step 2: Verify .npmignore exists**

Run: `cat .npmignore | head -5`
Expected: First 5 lines of .npmignore content shown

- [ ] **Step 3: Commit .npmignore**

```bash
git add .npmignore
git commit -m "chore: add .npmignore to exclude dev files from package

Keeps published package small by excluding src/, tests/, configs"
```

---

## Task 3: Add MIT License

**Files:**
- Create: `LICENSE`

**Interfaces:**
- Consumes: None
- Produces: LICENSE file with MIT license text

- [ ] **Step 1: Create LICENSE file**

Create `LICENSE` in project root with this content:

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

- [ ] **Step 2: Verify LICENSE exists**

Run: `head -3 LICENSE`
Expected: First 3 lines showing "MIT License" and copyright

- [ ] **Step 3: Commit LICENSE**

```bash
git add LICENSE
git commit -m "chore: add MIT license"
```

---

## Task 4: Update README with npx Instructions

**Files:**
- Modify: `README.md:1-60`

**Interfaces:**
- Consumes: Existing README.md structure
- Produces: README.md with Installation section and updated Claude Desktop Config

- [ ] **Step 1: Add Installation section before Quick Start**

Open `README.md` and add this content after line 3 (after the description line) and before the `## Quick Start` section:

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

- [ ] **Step 2: Update Claude Desktop Config section**

Replace the existing `## Claude Desktop Config` section (lines 12-23) with:

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

- [ ] **Step 3: Remove old Quick Start section**

Remove the old `## Quick Start` section that shows git clone (lines 5-10), since it's now covered in the Installation section under "From source".

- [ ] **Step 4: Verify README renders correctly**

Run: `head -30 README.md`
Expected: See Installation section with npx instructions, then Claude Desktop Config

- [ ] **Step 5: Commit README changes**

```bash
git add README.md
git commit -m "docs: update README with npx installation instructions

- Add Installation section with npx as recommended method
- Update Claude Desktop Config to use npx with -y flag
- Remove redundant Quick Start section"
```

---

## Task 5: Verify Build and Package

**Files:**
- None (verification only)

**Interfaces:**
- Consumes: package.json with "files" field, .npmignore, dist/ directory
- Produces: Verified build artifacts and package preview

- [ ] **Step 1: Clean and rebuild**

Run: `rm -rf dist && npm run build`
Expected: TypeScript compilation succeeds, dist/ directory created

- [ ] **Step 2: Run test suite**

Run: `npm test`
Expected: All tests pass (unit tests only, skip e2e:live)

- [ ] **Step 3: Preview package contents**

Run: `npm pack --dry-run`
Expected: Output shows only dist/, README.md, LICENSE, package.json included. Total size <100KB.

- [ ] **Step 4: Create local package tarball**

Run: `npm pack`
Expected: Creates background-ai-chat-0.1.0.tgz file

- [ ] **Step 5: Test local npx execution**

Run: `npx ./background-ai-chat-0.1.0.tgz --help 2>&1 | head -5`
Expected: Server starts in stdio mode (you may see "[bac] stdio transport connected" or similar)

Note: Press Ctrl+C to stop the server after verification.

- [ ] **Step 6: Clean up test tarball**

Run: `rm background-ai-chat-0.1.0.tgz`
Expected: Tarball removed

- [ ] **Step 7: Commit verification results (if any config changes were needed)**

If any fixes were made during verification:
```bash
git add .
git commit -m "chore: fix package verification issues"
```

Otherwise, no commit needed.

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Task 1: Package metadata (spec section 1)
- ✅ Task 2: .npmignore (spec section 2)
- ✅ Task 3: LICENSE (spec section 3)
- ✅ Task 4: README updates (spec section 4)
- ✅ Task 5: Pre-publish verification (spec "Publishing Process")

**Placeholder scan:**
- ✅ No TBD, TODO, or "implement later"
- ✅ No "add appropriate error handling" without specifics
- ✅ No "similar to Task N" without code
- ✅ All file paths are exact
- ✅ All code blocks are complete

**Type consistency:**
- ✅ File paths consistent across tasks
- ✅ Field names in package.json match spec exactly
- ✅ No naming conflicts between tasks

**Execution readiness:**
- ✅ Each task is independently testable
- ✅ Tasks can be executed in order without gaps
- ✅ Commit messages follow conventional commit format
- ✅ Verification steps have expected outputs

---

## Publishing Instructions (Manual — Not in Plan)

After completing all tasks, the package is ready for publishing. The actual publishing steps are:

1. `npm login` - Authenticate to npm registry
2. `npm publish --access public` - Publish package
3. `npx background-ai-chat@latest` - Verify published package works
4. Visit `https://www.npmjs.com/package/background-ai-chat` - Check npm page

These steps are intentionally left manual to avoid accidental publishing during plan execution.
