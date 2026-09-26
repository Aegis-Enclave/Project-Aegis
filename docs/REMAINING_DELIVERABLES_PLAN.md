# Project Aegis — Remaining Deliverables Implementation Plan

> **Source:** [PRD.md](../PRD.md) · [AGENTS.md](../AGENTS.md) · [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)  
> **Scope:** 4 unchecked items from PRD §7 Implementation Checklist  
> **Date:** 2026-09-27

---

## Table of Contents

- [Current State Summary](#current-state-summary)
- [Deliverable 1: Root Reusable GitHub Action (action.yml)](#deliverable-1-root-reusable-github-action-actionyml)
- [Deliverable 2: Root README.md](#deliverable-2-root-readmemd)
- [Deliverable 3: 1-Command Local Demo Runner](#deliverable-3-1-command-local-demo-runner)
- [Deliverable 4: PR Comment Visual Enhancements](#deliverable-4-pr-comment-visual-enhancements)
- [Execution Order & Dependencies](#execution-order--dependencies)
- [File Manifest](#file-manifest)
- [Risk Mitigation](#risk-mitigation)
- [Acceptance Criteria](#acceptance-criteria)

---

## Current State Summary

### Completed Components

| Component | Location | Key Facts |
|---|---|---|
| Backend API | `repo-a-backend/src/server.ts` | Express on `:3001`, `User` interface: `user_id: string`, `name: string`, `email: string`, `role: 'admin' \| 'member' \| 'viewer'` |
| Frontend Types | `repo-b-frontend/src/types.ts` | Matching `User` interface with `user_id: string` |
| Frontend Schemas | `repo-b-frontend/src/schemas.ts` | Matching `UserSchema` Zod object with `.strict()`, `UserFromSchema` inferred type |
| Frontend API Client | `repo-b-frontend/src/lib/api.ts` | `fetchUser()` with `fetchWithRetry` (exponential backoff), Zod `.parse()`, `validated as User` cast |
| MCP Server | `mcp-server/src/index.ts` | stdio transport via `@modelcontextprotocol/sdk`, `read_frontend_schema` + `write_frontend_schema` |
| MCP Config | `mcp-server/src/config.ts` | `getRepoBBasePath()` (dynamic function), allowlist: `['src/types.ts', 'src/schemas.ts']`, 512KB ceiling |
| MCP Validation | `mcp-server/src/validation.ts` | `McpToolError` with codes: `FILE_NOT_ALLOWED \| PATH_TRAVERSAL \| FILE_NOT_FOUND \| WRITE_FAILED \| FILE_TOO_LARGE`, symlink dereferencing |
| CI Workflow | `repo-a-backend/.github/workflows/aegis.yml` | 352-line workflow: PR trigger → diff extraction → Bob agent loop (3 iter) → Docker sandbox → frontend PR creation → status comment |
| Validation Sandbox | `repo-b-frontend/Dockerfile` | `node:20-alpine`, `npm run type-check` (`tsc --noEmit`) |
| Agent Prompt | `repo-a-backend/prompts/aegis-master-prompt.md` | 5-step prompt (Analyze → Read → Generate → Write → Validate) with `${BACKEND_DIFF}` and `${TSC_ERRORS}` substitution |
| MCP Connection Config | `repo-a-backend/mcp-config.json` | Key: `aegis-context-bridge`, command: `node`, args: `["mcp-server/dist/index.js"]`, env: `REPO_B_PATH: "./repo-b"` |
| Tests | `mcp-server/tests/` | 22 tests across 3 suites (validation, read, write) — all passing |
| Frontend Tests | `repo-b-frontend/src/lib/__tests__/` | 14 unit/integration tests — all passing |

### What Does NOT Exist Yet

- No root `action.yml`
- No root `README.md`
- No root `package.json`
- No `scripts/` directory
- No demo runner
- No success PR comment (only failure comment exists in `aegis.yml`)

---

## Deliverable 1: Root Reusable GitHub Action (`action.yml`)

**PRD Reference:** §4.2 Requirement 1

### 1.1 Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Action type | `composite` | Runs shell steps directly; no Docker overhead, no JS bundling |
| Relationship to `aegis.yml` | Extracts logic **from** `aegis.yml`; then `aegis.yml` becomes a thin consumer using `uses: ./` | Eliminates duplication |
| MCP server | Built in-action from source at `${{ github.action_path }}/mcp-server` | The MCP server lives in this repo; the action builds it at runtime |
| Bob installation | Extracted from `aegis.yml` lines 98–106 | Same npm-install-with-fallback pattern |
| Prompt resolution | `${{ github.action_path }}/repo-a-backend/prompts/aegis-master-prompt.md` | When used externally via `uses:`, `github.action_path` points to the checked-out action directory |
| MCP config | Dynamically generated at runtime | Must point `args` to the action's own `mcp-server/dist/index.js` path |

### 1.2 Interface Specification

```yaml
name: '🛡️ Project Aegis — Contract Sync'
description: >
  Autonomous API contract synchronization powered by IBM Bob 2.0 & MCP.
  Detects breaking backend API changes and auto-generates synchronized
  frontend PRs with updated TypeScript types and Zod schemas.

branding:
  icon: 'shield'
  color: 'blue'

inputs:
  target-repo:
    description: 'Target frontend repository (e.g., Aegis-Enclave/repo-b-frontend)'
    required: true
  target-token:
    description: 'GitHub PAT with Contents + Pull Requests write access on target repo'
    required: true
  bob-api-key:
    description: 'IBM Bob 2.0 API key'
    required: true
  source-file:
    description: 'Path to the backend API/contract source file'
    required: false
    default: 'src/server.ts'
  target-files:
    description: 'Comma-separated list of frontend schema files to sync'
    required: false
    default: 'src/types.ts,src/schemas.ts'
  max-iterations:
    description: 'Maximum Actor-Critic retry iterations'
    required: false
    default: '3'
  sandbox-mode:
    description: 'Validation sandbox: "docker" (isolated container) or "native" (direct tsc)'
    required: false
    default: 'docker'

outputs:
  pr-url:
    description: 'URL of the generated frontend pull request'
  sync-status:
    description: 'Result: SYNC_COMPLETE | NO_DIFF | FAILED'
```

### 1.3 Composite Action Steps

The `runs.steps` array extracts and parameterizes the logic from `aegis.yml`:

| Step # | Name | Source in `aegis.yml` | Key Changes |
|---|---|---|---|
| 1 | Clone target repo | Lines 43–51 | Use `${{ inputs.target-repo }}` and `${{ inputs.target-token }}` |
| 2 | Install target repo deps | Lines 62–64 | `npm ci` in `./repo-b` |
| 3 | Build MCP server | Lines 66–72 | Path: `${{ github.action_path }}/mcp-server` |
| 4 | Extract diff | Lines 78–92 | Use `${{ inputs.source-file }}` instead of hardcoded `src/server.ts` |
| 5 | Generate runtime MCP config | NEW | Write `mcp-config.json` pointing to `${{ github.action_path }}/mcp-server/dist/index.js` |
| 6 | Install Bob | Lines 98–106 | Same fallback chain |
| 7 | Aegis sync loop | Lines 114–191 | Use `${{ inputs.max-iterations }}`, `${{ inputs.sandbox-mode }}`, resolve prompt path via `${{ github.action_path }}` |
| 8 | Push & create frontend PR | Lines 231–311 | Use `${{ inputs.target-repo }}`, `${{ inputs.target-token }}` |
| 9 | Set outputs | NEW | Write `pr-url` and `sync-status` to `$GITHUB_OUTPUT` |

### 1.4 Refactored `aegis.yml`

After `action.yml` is created, refactor `repo-a-backend/.github/workflows/aegis.yml` to consume it:

```yaml
name: "🛡️ Project Aegis — Contract Sync"

on:
  pull_request:
    types: [opened, synchronize]
    paths:
      - 'src/server.ts'

permissions:
  contents: read
  pull-requests: write

jobs:
  aegis-sync:
    name: "Detect & Sync Frontend Contracts"
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: "📥 Checkout"
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: "🟢 Setup Node.js 20"
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: "🛡️ Run Aegis Sync"
        id: aegis
        uses: ./                           # Local composite action
        with:
          target-repo: Aegis-Enclave/repo-b-frontend
          target-token: ${{ secrets.FRONTEND_REPO_PAT }}
          bob-api-key: ${{ secrets.BOB_API_KEY }}

      - name: "💬 Post PR Comment"         # Now handled separately (see D4)
        # ... enhanced comment logic ...

      - name: "📋 Write Job Summary"
        if: always()
        run: |
          # ... same summary logic ...
```

### 1.5 Implementation Tasks

| # | Task | Est. Time |
|---|---|---|
| 1.5.1 | Create `action.yml` skeleton with inputs/outputs/branding | 10 min |
| 1.5.2 | Step: Clone target repo using inputs | 5 min |
| 1.5.3 | Step: Install deps (target repo + MCP server) | 5 min |
| 1.5.4 | Step: Build MCP server from `${{ github.action_path }}` | 5 min |
| 1.5.5 | Step: Extract diff using `${{ inputs.source-file }}` | 5 min |
| 1.5.6 | Step: Generate runtime `mcp-config.json` with dynamic paths | 10 min |
| 1.5.7 | Step: Install Bob (extract from aegis.yml) | 5 min |
| 1.5.8 | Step: Sync loop (parameterize iterations, sandbox-mode, prompt path) | 20 min |
| 1.5.9 | Step: Push changes & create PR on target repo | 10 min |
| 1.5.10 | Step: Set `$GITHUB_OUTPUT` for `pr-url` and `sync-status` | 5 min |
| 1.5.11 | Refactor `aegis.yml` to use `uses: ./` with input mappings | 15 min |
| 1.5.12 | Validate syntax with `actionlint` | 5 min |

---

## Deliverable 2: Root `README.md`

**PRD Reference:** §7 — Root `README.md` with badges, architecture diagrams, and submission pitch.

### 2.1 Document Structure

```
# 🛡️ Project Aegis

## Badges Row
  shields.io: CI status, Node 20+, TypeScript Strict, IBM Bob 2.0, MCP, License MIT

## One-Line Pitch
  "Autonomous API contract synchronization — zero-drift microservices
   powered by IBM Bob 2.0 & Model Context Protocol"

## The Problem (from PRD §2.1)
  - Silent runtime failures from stale types
  - O(N²) cross-team coordination
  - 2–3 sentences max

## How It Works
  - Mermaid flowchart (from PRD §4.1)
  - 3-bullet summary: Detect → Fix → Validate → PR

## 🚀 Quick Start
  ### Prerequisites
    Node.js 20+, Docker, IBM Bob 2.0 API key
  ### Run the Demo
    npm install && npm run demo
  ### Use as a GitHub Action
    uses: Aegis-Enclave/project-aegis@main
    with: target-repo, target-token, bob-api-key

## 🏗️ Architecture Deep-Dive
  ### System Components (3 packages)
  ### MCP Context Bridge
    - stdio transport, 2 tools, allowlist, path traversal protection
  ### Actor-Critic Validation Loop
    - Planner → Implementer → Critic (3 iterations max)
    - Docker sandbox: tsc --noEmit

## 📂 Repository Structure
  project-aegis/
  ├── repo-a-backend/     Express API
  ├── repo-b-frontend/    Next.js app
  ├── mcp-server/         MCP stdio server
  ├── action.yml          Reusable GitHub Action
  └── scripts/demo.ts     Local demo runner

## 🔒 Security
  - MCP allowlist (2 files only)
  - Path traversal prevention + symlink dereferencing
  - Atomic writes (tmp + rename)
  - 512KB file size ceiling

## 🧪 Testing
  cd mcp-server && npm test        # 22 tests
  cd repo-b-frontend && npm test   # 14 tests
  cd repo-b-frontend && npm run type-check

## 🏆 Hackathon Alignment
  Table from PRD §6 (Judging Criterion → How Aegis Excels)

## 🗺️ Roadmap (Phase 2 SaaS)
  - GitHub App onboarding
  - .aegis.yml config-as-code
  - Polyglot schema adapters
  - Firecracker microVM sandboxes

## Team & License
  Team Aegis Enclave · MIT License
```

### 2.2 Badges Specification

```markdown
![CI](https://github.com/Aegis-Enclave/project-aegis/actions/workflows/aegis.yml/badge.svg)
![Node](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)
![IBM Bob](https://img.shields.io/badge/IBM_Bob_2.0-Powered-052FAD?logo=ibm&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-Context_Bridge-8B5CF6)
![License](https://img.shields.io/badge/License-MIT-yellow)
```

### 2.3 Implementation Tasks

| # | Task | Est. Time |
|---|---|---|
| 2.3.1 | Create `README.md` with header, badges, pitch | 10 min |
| 2.3.2 | Write Problem + How It Works sections with mermaid diagram | 15 min |
| 2.3.3 | Write Quick Start (demo + action usage with `with:` block) | 10 min |
| 2.3.4 | Write Architecture Deep-Dive (MCP bridge, actor-critic loop) | 15 min |
| 2.3.5 | Write Repo Structure, Security, Testing sections | 10 min |
| 2.3.6 | Add Hackathon Alignment table from PRD §6 | 5 min |
| 2.3.7 | Add Roadmap teaser + Team/License footer | 5 min |
| 2.3.8 | Verify all mermaid diagrams render on GitHub | 5 min |

---

## Deliverable 3: 1-Command Local Demo Runner

**PRD Reference:** §4.2 Requirement 5

### 3.1 Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Mode | **Online** — uses real IBM Bob 2.0 + real MCP server | User will add API keys; demo must showcase actual agentic behavior |
| Runtime | TypeScript via `tsx` (no compile step needed) | Fast dev loop, matches the repo's TS-everywhere approach |
| Entry point | `scripts/demo.ts` | PRD specifies this |
| npm script | `npm run demo` in a root `package.json` | PRD specifies this |
| Root package.json | Minimal `private: true`, no workspaces | Script runner only — not a workspace manager (per AGENTS.md) |
| Bob invocation | `bob shell --headless` with MCP config, falling back to Bob API via `curl` | Same dual-mode as `aegis.yml` |
| Terminal output | `chalk` for colored diffs and status messages | Standard, zero-config |

### 3.2 The Breaking Change

Uses the canonical mutation documented in the existing implementation plan:

```diff
 interface User {
-  user_id: string;
+  uuid: string;
   name: string;
   email: string;
   role: 'admin' | 'member' | 'viewer';
 }

 app.get('/api/user', (_req: Request, res: Response) => {
   const user: User = {
-    user_id: 'u-001',
+    uuid: 'u-001',
     name: 'Alice',
```

This is the exact `user_id → uuid` rename from the PRD §1.1.4 breaking change specification.

### 3.3 Demo Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    npm run demo                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SCENE 1: Current State                                         │
│  ├─ Show current User contract in server.ts                     │
│  ├─ Show current types.ts + schemas.ts                          │
│  └─ Run type-check → ✅ PASS (everything in sync)              │
│                                                                  │
│  SCENE 2: Inject Breaking Change                                │
│  ├─ Rename user_id → uuid in server.ts                          │
│  ├─ Show colored diff of the backend change                     │
│  └─ Run type-check → ❌ FAIL (frontend is stale)               │
│                                                                  │
│  SCENE 3: Aegis Agent (Online — Real Bob + MCP)                 │
│  ├─ Build MCP server (npm run build in mcp-server/)             │
│  ├─ Generate runtime mcp-config.json pointing to local paths    │
│  ├─ Compute git-style diff of the injected change               │
│  ├─ Substitute diff into aegis-master-prompt.md template        │
│  ├─ Invoke Bob:                                                 │
│  │   Primary: bob shell --headless \                             │
│  │     --mcp-config /tmp/demo-mcp-config.json \                 │
│  │     --prompt <rendered prompt> \                              │
│  │     --max-iterations 5 --timeout 120                         │
│  │   Fallback: curl POST https://api.ibm.com/bob/v2/agent/run  │
│  │     with rendered prompt + mcp_config                        │
│  └─ Bob reads types.ts + schemas.ts via MCP, writes fixes       │
│                                                                  │
│  SCENE 4: Critic Validation                                     │
│  ├─ Run type-check → ✅ PASS (Aegis fixed the drift)           │
│  └─ If FAIL: show errors, retry (up to 3 iterations)           │
│                                                                  │
│  SCENE 5: Results                                               │
│  ├─ Show before/after diff of types.ts (colored)               │
│  ├─ Show before/after diff of schemas.ts (colored)             │
│  └─ Print summary: "In CI, this opens a PR automatically"      │
│                                                                  │
│  CLEANUP: Restore all files to original state                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Root `package.json`

```jsonc
{
  "name": "project-aegis",
  "version": "2.0.0",
  "private": true,
  "description": "Autonomous API Contract Synchronization — IBM Bob 2.0 + MCP",
  "scripts": {
    "demo": "npx tsx scripts/demo.ts"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "chalk": "^5.3.0"
  }
}
```

> **Note:** This is NOT a workspace manager. Per AGENTS.md: "All commands must be run from their respective sub-directory." This root `package.json` exists solely to provide the `npm run demo` entry point.

### 3.5 `scripts/demo.ts` — Implementation Specification

```typescript
// Pseudocode structure — actual implementation will follow this blueprint

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import chalk from 'chalk';

// ── Constants ──
const ROOT = path.resolve(import.meta.dirname, '..');
const BACKEND_SERVER = path.join(ROOT, 'repo-a-backend/src/server.ts');
const FRONTEND_TYPES = path.join(ROOT, 'repo-b-frontend/src/types.ts');
const FRONTEND_SCHEMAS = path.join(ROOT, 'repo-b-frontend/src/schemas.ts');
const MCP_SERVER_DIR = path.join(ROOT, 'mcp-server');
const FRONTEND_DIR = path.join(ROOT, 'repo-b-frontend');
const PROMPT_TEMPLATE = path.join(ROOT, 'repo-a-backend/prompts/aegis-master-prompt.md');
const MAX_ITERATIONS = 3;

// ── File Backup & Restore ──
const originals = new Map<string, string>();

function backup(file: string): void {
  originals.set(file, readFileSync(file, 'utf-8'));
}

function restore(): void {
  for (const [file, content] of originals) {
    writeFileSync(file, content, 'utf-8');
  }
  console.log(chalk.gray('\n🔄 All files restored to original state.'));
}

// ── Utilities ──
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function banner(text: string): void {
  const line = '═'.repeat(60);
  console.log(chalk.cyan(`\n${line}`));
  console.log(chalk.cyan.bold(`  ${text}`));
  console.log(chalk.cyan(`${line}\n`));
}

function runTypeCheck(): { passed: boolean; output: string } {
  try {
    const output = execSync('npm run type-check', {
      cwd: FRONTEND_DIR,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { passed: true, output };
  } catch (err: any) {
    return { passed: false, output: err.stderr || err.stdout || '' };
  }
}

function computeDiff(before: string, after: string): string {
  // Line-by-line diff with chalk coloring
  // Red for removed lines, green for added lines
  // ... implementation ...
}

// ── Scene Functions ──

async function scene1_currentState(): Promise<void> {
  banner('SCENE 1: Current State — Contracts In Sync');
  // Show current User contract
  // Run type-check → show PASS
}

async function scene2_injectBreakingChange(): Promise<void> {
  banner('SCENE 2: Backend Developer Makes a Breaking Change');
  backup(BACKEND_SERVER);
  backup(FRONTEND_TYPES);
  backup(FRONTEND_SCHEMAS);
  // Read server.ts, replace user_id → uuid, write back
  // Show colored diff
  // Run type-check → show FAIL
}

async function scene3_aegisAgent(): Promise<void> {
  banner('SCENE 3: 🤖 Aegis Agent — Autonomous Contract Sync');

  // 3a. Build MCP server
  console.log(chalk.yellow('  Building MCP Context Bridge...'));
  execSync('npm run build', { cwd: MCP_SERVER_DIR, stdio: 'pipe' });

  // 3b. Generate runtime mcp-config.json
  const mcpConfig = {
    mcpServers: {
      'aegis-context-bridge': {
        command: 'node',
        args: [path.join(MCP_SERVER_DIR, 'dist/index.js')],
        env: { REPO_B_PATH: FRONTEND_DIR }
      }
    }
  };
  const mcpConfigPath = '/tmp/aegis-demo-mcp-config.json';
  writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));

  // 3c. Compute diff of injected change
  const currentServer = readFileSync(BACKEND_SERVER, 'utf-8');
  const originalServer = originals.get(BACKEND_SERVER)!;
  const diff = computeUnifiedDiff(originalServer, currentServer, 'src/server.ts');

  // 3d. Render prompt template
  const template = readFileSync(PROMPT_TEMPLATE, 'utf-8');

  // 3e. Actor-Critic loop (up to MAX_ITERATIONS)
  let tscErrors = '';
  for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
    console.log(chalk.yellow(`\n  Iteration ${iter}/${MAX_ITERATIONS}...`));

    const prompt = template
      .replace('${BACKEND_DIFF}', diff)
      .replace('${TSC_ERRORS}', tscErrors);

    // Write prompt to temp file
    const promptPath = `/tmp/aegis-demo-prompt-iter-${iter}.md`;
    writeFileSync(promptPath, prompt);

    // Invoke Bob (primary: CLI, fallback: API)
    try {
      execSync(
        `bob shell --headless ` +
        `--mcp-config ${mcpConfigPath} ` +
        `--prompt "$(cat ${promptPath})" ` +
        `--max-iterations 5 --timeout 120`,
        { stdio: 'inherit' }
      );
    } catch {
      // Fallback to API
      const bobApiKey = process.env.BOB_API_KEY;
      if (bobApiKey) {
        execSync(
          `curl -s -X POST "https://api.ibm.com/bob/v2/agent/run" ` +
          `-H "Authorization: Bearer ${bobApiKey}" ` +
          `-H "Content-Type: application/json" ` +
          `-d '${JSON.stringify({
            prompt: readFileSync(promptPath, 'utf-8'),
            mcp_config: mcpConfig,
            max_iterations: 5,
          })}'`,
          { stdio: 'inherit' }
        );
      } else {
        console.log(chalk.red('  BOB_API_KEY not set and bob CLI not found.'));
        console.log(chalk.red('  Set BOB_API_KEY env var and retry.'));
        process.exit(1);
      }
    }

    // Critic: type-check
    const result = runTypeCheck();
    if (result.passed) {
      console.log(chalk.green(`  ✅ Type-check passed on iteration ${iter}`));
      break;
    } else {
      console.log(chalk.red(`  ❌ Type-check failed on iteration ${iter}`));
      tscErrors = result.output;
      if (iter === MAX_ITERATIONS) {
        console.log(chalk.red('  All iterations exhausted.'));
      }
    }
  }
}

async function scene4_results(): Promise<void> {
  banner('SCENE 4: Results — Frontend Contracts Synchronized');
  // Show before/after diffs of types.ts and schemas.ts
  // Print summary
}

// ── Main ──
async function main(): Promise<void> {
  // Safety: register cleanup handlers
  process.on('SIGINT', () => { restore(); process.exit(1); });
  process.on('SIGTERM', () => { restore(); process.exit(1); });

  banner('🛡️  PROJECT AEGIS — Local Demo');
  console.log(chalk.gray('  Autonomous API Contract Synchronization'));
  console.log(chalk.gray('  Powered by IBM Bob 2.0 + Model Context Protocol\n'));

  try {
    await scene1_currentState();
    await sleep(1500);
    await scene2_injectBreakingChange();
    await sleep(1500);
    await scene3_aegisAgent();
    await sleep(1000);
    await scene4_results();
  } finally {
    restore();
  }

  console.log(chalk.cyan.bold('\n  ✨ Demo complete.'));
  console.log(chalk.gray('  In CI, this automatically opens a PR on the frontend repo.\n'));
}

main().catch((err) => {
  console.error(chalk.red('Demo failed:'), err);
  restore();
  process.exit(1);
});
```

### 3.6 Implementation Tasks

| # | Task | Est. Time |
|---|---|---|
| 3.6.1 | Create root `package.json` (minimal, private, no workspaces) | 5 min |
| 3.6.2 | `npm install` at root (tsx, chalk) | 2 min |
| 3.6.3 | Create `scripts/demo.ts` scaffold (imports, constants, backup/restore) | 10 min |
| 3.6.4 | Implement `scene1_currentState()` — display contract, run type-check | 10 min |
| 3.6.5 | Implement `scene2_injectBreakingChange()` — mutate server.ts, show diff, type-check fails | 15 min |
| 3.6.6 | Implement `scene3_aegisAgent()` — build MCP, generate config, render prompt, invoke Bob, critic loop | 25 min |
| 3.6.7 | Implement `scene4_results()` — show before/after diffs, summary | 10 min |
| 3.6.8 | Implement `computeDiff()` — line-level diff with chalk colors | 10 min |
| 3.6.9 | Add cleanup handlers (SIGINT, SIGTERM, finally block) | 5 min |
| 3.6.10 | End-to-end test with `BOB_API_KEY` set | 10 min |
| 3.6.11 | Verify files are restored after demo (success AND Ctrl+C) | 5 min |

### 3.7 Environment Requirements

| Variable | Required | Purpose |
|---|---|---|
| `BOB_API_KEY` | Yes | IBM Bob 2.0 API key (user adds later) |
| `bob` CLI | Optional | If installed globally, used as primary invocation method |
| Node.js 20+ | Yes | Runtime |
| Docker | No | Not needed for demo (uses native `tsc --noEmit`) |

---

## Deliverable 4: PR Comment Visual Enhancements

**PRD Reference:** §4.2 Requirement 4

### 4.1 Current State

The existing `aegis.yml` has:

- **Failure comment** (L192–217): Basic text dumping raw `tsc` stderr, no structured formatting
- **Job summary** (L316–342): Markdown table in `$GITHUB_STEP_SUMMARY` (Actions tab only)
- **No success comment** on the backend PR itself — only the frontend PR is created

### 4.2 Changes Required

#### 4.2.1 New: Success Comment on Backend PR

Add a new step after the frontend PR creation step (after L311) that posts a rich comment:

```markdown
## 🛡️ Aegis Contract Sync — Completed

<table>
  <tr><td>🔄</td><td><b>Status</b></td>
      <td><img src="https://img.shields.io/badge/SYNC-COMPLETE-brightgreen?style=flat-square" /></td></tr>
  <tr><td>🔍</td><td><b>Backend PR</b></td>
      <td>#${PR_NUMBER}</td></tr>
  <tr><td>🎯</td><td><b>Trigger</b></td>
      <td>Changes in <code>${SOURCE_FILE}</code></td></tr>
  <tr><td>🔗</td><td><b>Frontend PR</b></td>
      <td><a href="${FRONTEND_PR_URL}">View synchronized PR →</a></td></tr>
  <tr><td>⏱️</td><td><b>Resolved in</b></td>
      <td>Iteration ${ITER}/${MAX_ITER}</td></tr>
</table>

<details>
<summary>🔍 Schema Changes Applied</summary>

```diff
${SCHEMA_DIFF}
```

</details>

<details>
<summary>🤖 Agent Execution Trace</summary>

| Phase | Agent | Status |
|---|---|---|
| 1. Analyze | 📋 Planner | ✅ Breaking changes detected |
| 2. Implement | 🔧 Implementer | ✅ `types.ts` + `schemas.ts` updated via MCP |
| 3. Validate | 🧪 Critic | ✅ `tsc --noEmit` passed (iter ${ITER}) |

</details>

<details>
<summary>📁 Files Modified</summary>

- `src/types.ts` — TypeScript interface synchronized
- `src/schemas.ts` — Zod validation schema synchronized

</details>

---
<sub>🛡️ Powered by <b>IBM Bob 2.0</b> + Model Context Protocol · <a href="https://github.com/Aegis-Enclave/project-aegis">Project Aegis</a></sub>
```

#### 4.2.2 Enhanced: Failure Comment

Replace the existing basic failure comment (L192–217) with:

```markdown
## 🛡️ Aegis Contract Sync — Failed

<table>
  <tr><td>❌</td><td><b>Status</b></td>
      <td><img src="https://img.shields.io/badge/SYNC-FAILED-red?style=flat-square" /></td></tr>
  <tr><td>🔍</td><td><b>Backend PR</b></td>
      <td>#${PR_NUMBER}</td></tr>
  <tr><td>👤</td><td><b>Author</b></td>
      <td>@${PR_AUTHOR}</td></tr>
  <tr><td>⏱️</td><td><b>Iterations</b></td>
      <td>${MAX_ITER}/${MAX_ITER} exhausted</td></tr>
</table>

<details>
<summary>🧪 TypeScript Compilation Errors</summary>

```
${TSC_OUTPUT}
```

</details>

<details>
<summary>🤖 Agent Execution Trace</summary>

| Phase | Agent | Status |
|---|---|---|
| 1. Analyze | 📋 Planner | ✅ Breaking changes detected |
| 2. Implement | 🔧 Implementer | ⚠️ Attempted ${MAX_ITER} iterations |
| 3. Validate | 🧪 Critic | ❌ `tsc --noEmit` failed |

</details>

> **Action Required:** @${PR_AUTHOR} — manual frontend type synchronization needed.

---
<sub>🛡️ Powered by <b>IBM Bob 2.0</b> + Model Context Protocol · <a href="https://github.com/Aegis-Enclave/project-aegis">Project Aegis</a></sub>
```

### 4.3 Workflow Modifications

| # | Location in `aegis.yml` | Change |
|---|---|---|
| 4.3.1 | L172–175 (inside sync loop, after `SYNC_COMPLETE`) | Add `echo "AEGIS_ITER=${ITER}" >> $GITHUB_ENV` to export the passing iteration number |
| 4.3.2 | L219–225 ("Show Changes Made" step) | Also write diff to `/tmp/schema-diff.patch`: `git diff > /tmp/schema-diff.patch` |
| 4.3.3 | L192–217 (failure comment) | Replace entire block with enhanced failure template (§4.2.2) |
| 4.3.4 | New step after L311 | Add "Post Success Comment on Backend PR" step with enhanced success template (§4.2.1) |
| 4.3.5 | Both comment steps | Add idempotency: search for existing `🛡️ Aegis Contract Sync` comment and update it instead of creating duplicates |

### 4.4 Idempotency Guard (Comment Deduplication)

```bash
# Find existing Aegis comment on the PR
EXISTING_COMMENT_ID=$(gh api \
  "repos/${{ github.repository }}/issues/${{ github.event.pull_request.number }}/comments" \
  --jq '.[] | select(.body | startswith("## 🛡️ Aegis Contract Sync")) | .id' \
  | head -1)

if [ -n "${EXISTING_COMMENT_ID}" ]; then
  # Update existing comment
  gh api \
    "repos/${{ github.repository }}/issues/comments/${EXISTING_COMMENT_ID}" \
    -X PATCH -f body="${COMMENT_BODY}"
else
  # Create new comment
  gh pr comment "${PR_NUMBER}" \
    --repo "${{ github.repository }}" \
    --body "${COMMENT_BODY}"
fi
```

### 4.5 Implementation Tasks

| # | Task | Est. Time |
|---|---|---|
| 4.5.1 | Export `AEGIS_ITER` from sync loop to `$GITHUB_ENV` | 5 min |
| 4.5.2 | Capture schema diff to `/tmp/schema-diff.patch` | 5 min |
| 4.5.3 | Write enhanced failure comment template (replace L192–217) | 15 min |
| 4.5.4 | Write enhanced success comment template (new step) | 15 min |
| 4.5.5 | Implement idempotency guard (search + update OR create) | 10 min |
| 4.5.6 | Test comment rendering with a dummy PR | 10 min |

---

## Execution Order & Dependencies

```
  ┌──────────────────────────────────────────────────────────────┐
  │  ORDER    DELIVERABLE                   REASON               │
  ├──────────────────────────────────────────────────────────────┤
  │                                                              │
  │  1st      D4: PR Comment Enhancements   aegis.yml must be   │
  │           (edit aegis.yml)              finalized before     │
  │                                         D1 extracts from it │
  │                                                              │
  │  2nd      D1: action.yml               Extracts finalized   │
  │           (extract from aegis.yml)      logic; refactors     │
  │                                         aegis.yml to consume │
  │                                                              │
  │  3rd      D3: Demo Runner              Independent of D1/D4 │
  │           (create scripts/demo.ts)     creates root pkg.json │
  │                                                              │
  │  4th      D2: README.md                References D1 (action │
  │           (create root docs)           usage) and D3 (demo   │
  │                                         instructions)        │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

### Time Estimates

| Deliverable | Estimated Time |
|---|---|
| D4: PR Comment Enhancements | ~60 min |
| D1: `action.yml` + refactor `aegis.yml` | ~100 min |
| D3: Demo Runner + root `package.json` | ~105 min |
| D2: `README.md` | ~75 min |
| **Total** | **~340 min (~5.5 hours)** |

---

## File Manifest

### New Files

| File | Description |
|---|---|
| `action.yml` | Reusable composite GitHub Action (root level) |
| `README.md` | Root documentation with badges, mermaid diagrams, quick start |
| `package.json` | Minimal root package (`private: true`) for demo script |
| `scripts/demo.ts` | 1-command local demo runner (online, uses real Bob + MCP) |

### Modified Files

| File | Changes |
|---|---|
| `repo-a-backend/.github/workflows/aegis.yml` | Enhanced PR comments (success + failure templates, idempotency), then refactored to consume `action.yml` via `uses: ./` |

### Unchanged Files

All existing source files, tests, configs, and MCP server code remain untouched.

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Composite action `${{ github.action_path }}` resolution when used externally | MCP server path breaks | Generate `mcp-config.json` at runtime with absolute path from `${{ github.action_path }}` |
| Demo runner modifies source files | Corrupted working tree | Robust cleanup: `finally` block + `SIGINT`/`SIGTERM` handlers + backup map |
| Root `package.json` conflicts with AGENTS.md's "no root package.json" note | Confusion | Mark `private: true`, no workspaces; update AGENTS.md to note it exists solely for `npm run demo` |
| PR comment exceeds GitHub's 65535 char limit | Comment truncated | Use `<details>` collapsible sections; only summary table is always visible |
| Bob CLI not installed locally | Demo fails | Fallback to Bob API via `curl`; if no API key either, exit with clear error message |
| `schemas.ts` uses `.strict()` | Agent-generated schema missing `.strict()` breaks type-check | The master prompt instructs "Preserve ALL existing code structure" — `.strict()` should be preserved. If not, the critic loop catches it. |
| Frontend `fetchWithRetry` references `user.user_id` in `page.tsx` | Type-check catches it since `User` interface changes | The Aegis scope only covers `types.ts` and `schemas.ts` — `page.tsx` is outside the MCP allowlist. Type-check may still fail on `page.tsx` references. This is acceptable — the demo proves the concept. |

---

## Acceptance Criteria

- [ ] **D1:** `action.yml` is valid composite action syntax (passes `actionlint`)
- [ ] **D1:** `aegis.yml` uses `uses: ./` to consume the action with all inputs mapped
- [ ] **D1:** Both `pr-url` and `sync-status` outputs are set correctly
- [ ] **D2:** `README.md` renders correctly on GitHub with all badges and mermaid diagrams
- [ ] **D2:** Quick start section references demo runner and action usage
- [ ] **D3:** `npm run demo` executes the full online flow with Bob + MCP
- [ ] **D3:** Demo exits with clear error if `BOB_API_KEY` is not set and Bob CLI is not found
- [ ] **D3:** All files restored to original state on success, on failure, and on Ctrl+C
- [ ] **D4:** Success PR comment renders with collapsible sections, badges, agent trace, and frontend PR link
- [ ] **D4:** Failure PR comment includes TSC errors in collapsible code block with badge
- [ ] **D4:** Duplicate comments are updated (not duplicated) via idempotency guard
- [ ] **ALL:** Existing tests still pass: `cd mcp-server && npm test` (22 tests)
- [ ] **ALL:** Frontend type-check still passes: `cd repo-b-frontend && npm run type-check`
