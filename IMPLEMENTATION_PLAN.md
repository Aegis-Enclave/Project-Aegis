# Project Aegis — Technical Implementation Plan

> **Source documents:** [PRD.md](./PRD.md) · [script.md](./script.md)  
> **Timeline:** 24-hour hackathon sprint (IBM Bob 2.0 Hackathon)  
> **Objective:** Autonomous CI/CD agent that detects backend breaking changes and auto-generates synchronized frontend PRs  
> **Team:** Aegis Enclave

---

## Table of Contents

- [System Architecture Overview](#system-architecture-overview)
- [Phase 1: Mock Repository Scaffolding (Hours 0–2)](#phase-1-mock-repository-scaffolding-hours-02)
- [Phase 2: MCP Server Development (Hours 2–8)](#phase-2-mcp-server-development-hours-28)
- [Phase 3: Bob Shell & CI/CD Pipeline Integration (Hours 8–14)](#phase-3-bob-shell--cicd-pipeline-integration-hours-814)
- [Phase 4: Prompt Engineering & Actor-Critic Loop (Hours 14–18)](#phase-4-prompt-engineering--actor-critic-loop-hours-1418)
- [Phase 5: Demo Recording & Submission (Hours 18–24)](#phase-5-demo-recording--submission-hours-1824)
- [Cross-Phase: Risk Mitigation & Rollback Strategy](#cross-phase-risk-mitigation--rollback-strategy)
- [Appendix: Complete File Manifest](#appendix-complete-file-manifest)

---

## System Architecture Overview

The system spans two GitHub repositories, a custom MCP server, and the IBM Bob 2.0 agent runtime. All execution happens headlessly inside a GitHub Actions runner.

```
                        ┌──────────────────────────────────────────────────────────────┐
                        │                  GitHub Actions Runner (ubuntu-latest)        │
                        │                                                              │
┌───────────────┐       │   ┌────────────┐       ┌──────────────────────────────┐       │       ┌───────────────┐
│  Repo A       │       │   │  IBM Bob   │       │  MCP Context Bridge          │       │       │  Repo B       │
│  (Backend)    │  PR   │   │  2.0 Shell │ MCP   │  (Express + MCP SDK)         │       │       │  (Frontend)   │
│               │──────►│   │  Headless  │◄─────►│                              │       │       │               │
│  Node.js /    │       │   │            │       │  ┌────────────────────────┐  │       │       │  Next.js /    │
│  Express      │       │   │  Agents:   │       │  │ read_frontend_schema  │  │       │       │  TypeScript   │
│               │       │   │  Planner   │       │  │ write_frontend_schema │  │       │       │               │
│  GET /api/    │       │   │  Implement │       │  └──────────┬─────────────┘  │       │       │  types.ts     │
│  user         │       │   │  Critic    │       │             │ fs read/write  │       │  PR   │  schemas.ts   │
│               │       │   └─────┬──────┘       │             ▼                │──────►│       │               │
│               │       │         │              │     ./repo-b/ (local clone)  │       │       │               │
│               │       │         │ npm run      │                              │       │       │               │
│               │       │         │ type-check   └──────────────────────────────┘       │       │               │
│               │       │         ▼                                                     │       │               │
│               │       │   ┌────────────┐                                              │       │               │
│               │       │   │  Sandbox   │                                              │       │               │
│               │       │   │  tsc       │                                              │       │               │
│               │       │   │  --noEmit  │                                              │       │               │
│               │       │   └────────────┘                                              │       │               │
└───────────────┘       └──────────────────────────────────────────────────────────────┘       └───────────────┘
```

### Data Flow Summary

1. Developer opens a PR on **Repo A** that modifies the API response payload.
2. A GitHub Action (`on: pull_request`) fires, clones **Repo B** into `./repo-b`, starts the **MCP server**, and launches **Bob Shell** headlessly.
3. **Planner agent** reads the `git diff` and determines if frontend contracts break.
4. **Implementer agent** uses MCP tools to read current frontend types, generates updated code, and writes it back.
5. **Critic agent** runs `npm run type-check` natively in the runner. On failure, stderr is fed back to the Implementer (max 3 retries).
6. On success, the Action commits changes to `./repo-b`, pushes a new branch, and opens a PR on **Repo B**.

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Backend API (Repo A) | Node.js + Express + TypeScript | Mock API returning `User` object |
| Frontend App (Repo B) | Next.js + TypeScript + Zod | Type definitions & runtime validation |
| MCP Server | Node.js + Express + IBM Bob MCP SDK | Context bridge (filesystem tools for Bob) |
| Agent Runtime | IBM Bob 2.0 Shell (headless) | Multi-agent orchestration with dynamic model selection |
| CI/CD Pipeline | GitHub Actions | Trigger, environment, and PR automation |
| Validation Sandbox | `tsc --noEmit` (native in runner) | TypeScript type-checking without compilation |

---

## Phase 1: Mock Repository Scaffolding (Hours 0–2)

**Goal:** Create two fully functional, synced repositories that represent a real-world backend↔frontend data contract. Establish the "before" state shown in Scene 1 of the demo script.

**Time Budget:** 2 hours  
**Dependencies:** None (starting point)  
**Owner:** Full team (pair programming recommended)

---

### 1.1 Repo A — Backend (Node.js/Express)

#### 1.1.1 Directory Structure

```
repo-a-backend/
├── src/
│   └── server.ts               ← Express API with /api/user endpoint
├── package.json                ← Project manifest + npm scripts
├── tsconfig.json               ← TypeScript strict mode configuration
├── .github/
│   └── workflows/
│       └── aegis.yml           ← Placeholder (completed in Phase 3)
├── .gitignore                  ← node_modules, dist, .env
└── README.md                   ← Project description
```

#### 1.1.2 Implementation Tasks

| # | Task | Technical Details | Acceptance Criteria |
|---|------|-------------------|---------------------|
| 1.1.2a | Initialize Node.js project | Run `npm init -y`. Install production deps: `express`. Install dev deps: `typescript`, `ts-node`, `@types/express`, `@types/node`. | `package.json` exists with all dependencies listed |
| 1.1.2b | Configure TypeScript | Create `tsconfig.json` with: `"strict": true`, `"esModuleInterop": true`, `"target": "ES2020"`, `"module": "commonjs"`, `"outDir": "./dist"`, `"rootDir": "./src"`, `"resolveJsonModule": true`, `"skipLibCheck": true` | `npx tsc --noEmit` exits with code 0 |
| 1.1.2c | Create `.gitignore` | Ignore `node_modules/`, `dist/`, `.env`, `*.js.map` | File exists and patterns are correct |
| 1.1.2d | Create mock API server | Write `src/server.ts` with Express app, single `GET /api/user` endpoint returning hardcoded `User` JSON payload. Server listens on port `3001`. | `npx ts-node src/server.ts` starts server; `curl http://localhost:3001/api/user` returns valid JSON |
| 1.1.2e | Add npm scripts | Add to `package.json`: `"dev": "ts-node src/server.ts"`, `"build": "tsc"`, `"start": "node dist/server.js"` | All three scripts execute without error |
| 1.1.2f | Create GitHub Actions placeholder | Create `.github/workflows/aegis.yml` with a minimal placeholder comment: `# Project Aegis workflow — implemented in Phase 3` | File exists at correct path |
| 1.1.2g | Write README | Brief project description, setup instructions, API documentation | README exists with useful content |
| 1.1.2h | Push to GitHub | Create repository `Aegis-Enclave/repo-a-backend` on GitHub. Initialize git, add all files, commit with message `"feat: initial backend mock API"`, push to `main`. | Repository visible on GitHub, `main` branch has all files |

#### 1.1.3 Mock API Contract — Canonical Source Code

This is the exact code to implement for `src/server.ts`:

```typescript
// src/server.ts
import express, { Request, Response } from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

// ───────────────────────────────────────────────
// Data Contract: User
// This interface defines the API response shape.
// The frontend (Repo B) depends on this contract.
// ───────────────────────────────────────────────
interface User {
  user_id: string;    // ← THIS FIELD will be renamed to `uuid` in the demo
  name: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
}

// GET /api/user — Returns a single user object
app.get('/api/user', (_req: Request, res: Response) => {
  const user: User = {
    user_id: 'u-001',
    name: 'Alice',
    email: 'alice@aegis.dev',
    role: 'admin',
  };
  res.json(user);
});

app.listen(PORT, () => {
  console.log(`[Repo A] Backend API running on http://localhost:${PORT}`);
});
```

> **Design Decision:** The `User` interface is intentionally minimal (4 fields). For the hackathon demo, we only need one mutation (`user_id` → `uuid`) to prove the concept. The simplicity makes the demo easier to follow and reduces the surface area for LLM errors.

#### 1.1.4 The Breaking Change (For Demo — Scene 2)

During the demo, the developer will make this exact change and open a PR:

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

This change will be made on a feature branch (e.g., `feat/rename-user-id`) and submitted as a Pull Request, which triggers the Aegis pipeline.

---

### 1.2 Repo B — Frontend (Next.js)

#### 1.2.1 Directory Structure

```
repo-b-frontend/
├── src/
│   ├── types.ts                ← TypeScript interfaces (data contracts)
│   ├── schemas.ts              ← Zod runtime validation schemas
│   ├── app/
│   │   ├── layout.tsx          ← Root layout (Next.js App Router)
│   │   └── page.tsx            ← Main page component displaying user data
│   └── lib/
│       └── api.ts              ← Fetch utility with Zod parsing
├── package.json                ← Project manifest + npm scripts (incl. type-check)
├── tsconfig.json               ← TypeScript configuration
├── .gitignore                  ← Standard Next.js ignores
├── next.config.js              ← Next.js configuration
└── README.md                   ← Project description
```

#### 1.2.2 Implementation Tasks

| # | Task | Technical Details | Acceptance Criteria |
|---|------|-------------------|---------------------|
| 1.2.2a | Scaffold Next.js application | Run `npx create-next-app@latest repo-b-frontend --typescript --app --eslint --no-tailwind --no-src-dir` (or with `--src-dir` if preferred). Verify App Router is enabled. | `npm run dev` starts development server on port 3000 |
| 1.2.2b | Install Zod | Run `npm install zod` in the frontend project directory. | `zod` appears in `dependencies` in `package.json` |
| 1.2.2c | Create `src/types.ts` | TypeScript interface `User` with fields: `user_id: string`, `name: string`, `email: string`, `role: 'admin' \| 'member' \| 'viewer'`. Must use `export interface`. | File exists, can be imported without errors |
| 1.2.2d | Create `src/schemas.ts` | Zod schema `UserSchema` using `z.object()` matching all fields from `types.ts`. Export both the schema and the inferred type `type UserFromSchema = z.infer<typeof UserSchema>`. | `z.infer<typeof UserSchema>` produces a type structurally identical to the `User` interface |
| 1.2.2e | Create `src/lib/api.ts` | Async function `fetchUser()` that: (1) calls `fetch('http://localhost:3001/api/user')`, (2) parses response JSON, (3) validates with `UserSchema.parse()`, (4) returns typed `User` object. Include error handling for fetch failures and Zod validation errors. | Function returns typed `User` when backend is running |
| 1.2.2f | Create `src/app/page.tsx` | React component (client or server) that calls `fetchUser()` and renders the user's name, email, role, and user_id in a simple layout. | Browser at `localhost:3000` displays user information correctly |
| 1.2.2g | Add `type-check` npm script | Add `"type-check": "tsc --noEmit"` to `scripts` in `package.json`. This is the critical script that the Critic agent will invoke. | `npm run type-check` exits with code 0 when types are in sync; exits with non-zero when types are mismatched |
| 1.2.2h | Verify type-check detects breakage | Temporarily change `user_id` to `uuid` in only `types.ts` (not `schemas.ts`). Run `npm run type-check`. Confirm it reports an error. Revert the change. | Type-check correctly catches type mismatches between files |
| 1.2.2i | Push to GitHub | Create repository `Aegis-Enclave/repo-b-frontend` on GitHub. Initialize git, add all files, commit with message `"feat: initial frontend with TypeScript types and Zod schemas"`, push to `main`. | Repository visible on GitHub, `main` branch has all files |

#### 1.2.3 Frontend Type Files — Canonical Source Code

**`src/types.ts`** — The TypeScript interface file that defines the data contract:

```typescript
// src/types.ts
//
// Frontend data contract for the User entity.
// This interface MUST match the backend API response shape (Repo A: GET /api/user).
// Project Aegis automatically keeps this in sync when the backend changes.

export interface User {
  user_id: string;    // Unique user identifier — matches backend field name
  name: string;       // User's display name
  email: string;      // User's email address
  role: 'admin' | 'member' | 'viewer';  // User's permission level
}
```

**`src/schemas.ts`** — The Zod runtime validation schema:

```typescript
// src/schemas.ts
//
// Zod runtime validation schema for the User entity.
// Provides runtime type safety on top of TypeScript's compile-time checks.
// MUST stay in sync with the TypeScript interface in types.ts.

import { z } from 'zod';

export const UserSchema = z.object({
  user_id: z.string(),                              // Matches User.user_id
  name: z.string(),                                 // Matches User.name
  email: z.string().email(),                         // Matches User.email (with email validation)
  role: z.enum(['admin', 'member', 'viewer']),       // Matches User.role
});

// Inferred type — should be structurally identical to the User interface in types.ts
export type UserFromSchema = z.infer<typeof UserSchema>;
```

**`src/lib/api.ts`** — The fetch utility:

```typescript
// src/lib/api.ts
import { UserSchema } from '../schemas';
import type { User } from '../types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Fetches the current user from the backend API.
 * Validates the response against the Zod schema for runtime type safety.
 */
export async function fetchUser(): Promise<User> {
  const response = await fetch(`${BACKEND_URL}/api/user`);

  if (!response.ok) {
    throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Runtime validation — catches contract mismatches that TypeScript can't detect at runtime
  const validated = UserSchema.parse(data);

  // Cast to our TypeScript interface type
  // (structurally identical to UserFromSchema, but we use the explicit interface for clarity)
  return validated as User;
}
```

**`src/app/page.tsx`** — Simple display component:

```tsx
// src/app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { fetchUser } from '../lib/api';
import type { User } from '../types';

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUser()
      .then(setUser)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div>Error: {error}</div>;
  if (!user) return <div>Loading...</div>;

  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>Project Aegis — Frontend</h1>
      <h2>User Data (from Backend API)</h2>
      <table style={{ borderCollapse: 'collapse', marginTop: '1rem' }}>
        <tbody>
          <tr><td><strong>user_id</strong></td><td>{user.user_id}</td></tr>
          <tr><td><strong>name</strong></td><td>{user.name}</td></tr>
          <tr><td><strong>email</strong></td><td>{user.email}</td></tr>
          <tr><td><strong>role</strong></td><td>{user.role}</td></tr>
        </tbody>
      </table>
    </main>
  );
}
```

> **Important:** The `types.ts` and `schemas.ts` files are kept as **separate files** deliberately. This makes it trivial for the MCP tools to target each file independently and simplifies the Implementer agent's prompt. The agent never has to parse a large multi-concern file — it reads, modifies, and writes back one focused file at a time.

---

### 1.3 GitHub Configuration & Cross-Repo Access

#### 1.3.1 Tasks

| # | Task | Technical Details | Acceptance Criteria |
|---|------|-------------------|---------------------|
| 1.3.1a | Create Fine-Grained Personal Access Token | Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens. Create a token named `AEGIS_CROSS_REPO_PAT` with: **Repository access:** `Aegis-Enclave/repo-b-frontend` only. **Permissions:** `Contents: Read and write`, `Pull requests: Read and write`, `Metadata: Read`. **Expiration:** 7 days (sufficient for hackathon). | Token generated and copied securely |
| 1.3.1b | Add `FRONTEND_REPO_PAT` secret to Repo A | Go to Repo A → Settings → Secrets and variables → Actions → New repository secret. Name: `FRONTEND_REPO_PAT`. Value: the PAT from step 1.3.1a. | Secret visible in Repo A's settings (value hidden) |
| 1.3.1c | Add `BOB_API_KEY` secret to Repo A | Same process. Name: `BOB_API_KEY`. Value: IBM Bob 2.0 API key. | Secret visible in Repo A's settings |
| 1.3.1d | Verify cross-repo clone | Manually test from terminal: `git clone https://x-access-token:<PAT>@github.com/Aegis-Enclave/repo-b-frontend.git ./test-clone`. Verify clone succeeds. Delete `./test-clone`. | Clone completes without authentication errors |
| 1.3.1e | Verify cross-repo push | In the test clone, create a test branch, make a trivial change, push. Then delete the test branch. | Push succeeds; branch appears on GitHub; cleanup complete |

#### 1.3.2 Security Notes

- The PAT is **scoped to a single repository** (repo-b-frontend) — it cannot access any other repos in the org.
- The PAT has **minimal permissions** — only contents (to push code) and pull-requests (to create PRs).
- The PAT is stored as a **GitHub Actions secret** — it's encrypted at rest and only exposed to the workflow at runtime.
- The PAT expires in **7 days** — well within the hackathon timeline; no long-lived credentials.

---

### 1.4 End-to-End Verification ("Before" State)

This final verification step proves both repos are correctly set up and in sync before moving to Phase 2.

| # | Step | Command | Expected Result |
|---|------|---------|----------------|
| 1.4.1 | Start backend server | `cd repo-a-backend && npm run dev` | Terminal shows: `[Repo A] Backend API running on http://localhost:3001` |
| 1.4.2 | Test API endpoint | `curl -s http://localhost:3001/api/user \| jq .` | Returns `{ "user_id": "u-001", "name": "Alice", "email": "alice@aegis.dev", "role": "admin" }` |
| 1.4.3 | Start frontend server | `cd repo-b-frontend && npm run dev` | Terminal shows Next.js dev server on port 3000 |
| 1.4.4 | Verify frontend display | Open `http://localhost:3000` in browser | Page shows user data: user_id, name, email, role — all matching backend |
| 1.4.5 | Run type-check | `cd repo-b-frontend && npm run type-check` | Exit code 0 — all types are in sync |
| 1.4.6 | Verify type-check catches breakage | Temporarily rename `user_id` to `uuid` in `types.ts` only, run `npm run type-check` | Exit code non-zero — TypeScript reports errors |
| 1.4.7 | Revert test change | `git checkout -- src/types.ts` | File restored to original |

### Phase 1 Completion Gate

All of the following must be true before proceeding to Phase 2:

- [ ] Repo A (`repo-a-backend`) is on GitHub with a clean `main` branch
- [ ] Repo B (`repo-b-frontend`) is on GitHub with a clean `main` branch
- [ ] `npm run type-check` passes in Repo B (exit code 0)
- [ ] Frontend correctly fetches and displays backend data in browser
- [ ] `type-check` correctly fails when types are manually de-synced
- [ ] Cross-repo PAT clone and push verified manually
- [ ] Both secrets (`FRONTEND_REPO_PAT`, `BOB_API_KEY`) are configured in Repo A
- [ ] Placeholder `.github/workflows/aegis.yml` exists in Repo A

---

## Phase 2: MCP Server Development (Hours 2–8)

**Goal:** Build a custom Model Context Protocol server that provides Bob Shell with secure, scoped filesystem tools to read and write Repo B's type files from within the Repo A CI runner.

**Time Budget:** 6 hours (largest phase — this is the critical path)  
**Dependencies:** Phase 1 complete (Repo B must exist with `types.ts` and `schemas.ts`)  
**Owner:** Primary developer (most technically demanding component)

---

### 2.1 MCP Server Architecture

The MCP server acts as a "Context Bridge" — it gives Bob Shell secure, controlled access to Repo B's filesystem without exposing the entire runner filesystem.

```
┌──────────────────────────────────────────────────┐
│              MCP Context Bridge Server            │
│              (Express + MCP SDK)                  │
│                                                   │
│  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │  Tool Registration  │  │  Health Endpoint    │ │
│  │  (MCP SDK)          │  │  GET /health        │ │
│  └────────┬────────────┘  └─────────────────────┘ │
│           │                                        │
│  ┌────────▼───────────────────────────────────┐   │
│  │             Tool Handlers                   │   │
│  │                                             │   │
│  │  ┌───────────────────┐ ┌──────────────────┐ │   │
│  │  │ read_frontend_    │ │ write_frontend_  │ │   │
│  │  │ schema            │ │ schema           │ │   │
│  │  │                   │ │                  │ │   │
│  │  │ 1. Validate path  │ │ 1. Validate path │ │   │
│  │  │ 2. Check allowlist│ │ 2. Check allow.  │ │   │
│  │  │ 3. fs.readFile()  │ │ 3. fs.writeFile()│ │   │
│  │  │ 4. Return content │ │ 4. Return status │ │   │
│  │  └───────────────────┘ └──────────────────┘ │   │
│  └─────────────────────┬───────────────────────┘   │
│                        │                            │
│                        ▼                            │
│              ┌──────────────────┐                   │
│              │  Security Layer  │                   │
│              │  • Path allow-   │                   │
│              │    list check    │                   │
│              │  • Path traversal│                   │
│              │    prevention    │                   │
│              │  • Boundary      │                   │
│              │    validation    │                   │
│              └────────┬─────────┘                   │
│                       ▼                             │
│              ┌──────────────────┐                   │
│              │  ./repo-b/       │                   │
│              │  (local clone)   │                   │
│              │  ├── src/        │                   │
│              │  │   ├── types.ts│                   │
│              │  │   └── schemas │                   │
│              │  │       .ts     │                   │
│              └──────────────────┘                   │
└──────────────────────────────────────────────────┘
```

### 2.2 Directory Structure

```
mcp-server/
├── src/
│   ├── index.ts                    ← Entry point: server bootstrap, tool registration
│   ├── config.ts                   ← Path constants, environment variables, defaults
│   ├── validation.ts               ← Input validation & path security helpers
│   └── tools/
│       ├── readFrontendSchema.ts   ← read_frontend_schema tool handler
│       └── writeFrontendSchema.ts  ← write_frontend_schema tool handler
├── tests/
│   ├── readFrontendSchema.test.ts  ← Unit tests for read tool
│   ├── writeFrontendSchema.test.ts ← Unit tests for write tool
│   └── validation.test.ts          ← Unit tests for path security
├── package.json                    ← Dependencies + scripts
├── tsconfig.json                   ← TypeScript configuration
└── README.md                       ← Setup & usage documentation
```

### 2.3 Implementation Tasks

| # | Task | Technical Details | Acceptance Criteria |
|---|------|-------------------|---------------------|
| 2.3.1 | Initialize Node.js project | `cd mcp-server && npm init -y`. Install production deps: `express`, `@anthropic-ai/mcp-sdk` (or IBM Bob MCP SDK — verify actual package name). Install dev deps: `typescript`, `ts-node`, `@types/express`, `@types/node`, `jest`, `ts-jest`, `@types/jest`. | `package.json` with all dependencies; `npm install` completes cleanly |
| 2.3.2 | Configure TypeScript | `tsconfig.json`: `"strict": true`, `"target": "ES2020"`, `"module": "commonjs"`, `"outDir": "./dist"`, `"rootDir": "./src"`, `"esModuleInterop": true` | `npx tsc --noEmit` passes |
| 2.3.3 | Create config module | `src/config.ts`: Export constants loaded from env vars with sensible defaults. See specification below. | Config module exports all constants; defaults work when env vars are unset |
| 2.3.4 | Create validation module | `src/validation.ts`: Path security functions — allowlist check, traversal detection, boundary validation. See specification below. | All validation functions work correctly; traversal attacks blocked |
| 2.3.5 | Implement `read_frontend_schema` | `src/tools/readFrontendSchema.ts`: Handler function that validates input, reads file, returns content. See full specification below. | Tool returns file content with metadata (line count, file path) |
| 2.3.6 | Implement `write_frontend_schema` | `src/tools/writeFrontendSchema.ts`: Handler function that validates input, writes file, returns confirmation. See full specification below. | Tool overwrites file and returns success + bytes written |
| 2.3.7 | Create server entry point | `src/index.ts`: Initialize Express app, create MCP server instance, register both tools with schemas, add health endpoint, start listening. See specification below. | Server starts on configured port; MCP tools registered; health check returns 200 |
| 2.3.8 | Write unit tests | Tests for both tools and validation module using Jest. Use temp directories for filesystem tests (no mocking of fs — test real file operations). | `npm test` passes; covers happy path, error paths, and security paths |
| 2.3.9 | Add npm scripts | `"dev": "ts-node src/index.ts"`, `"build": "tsc"`, `"start": "node dist/index.js"`, `"test": "jest"` | All scripts work |
| 2.3.10 | Local integration test with Bob Shell | Start MCP server locally. Configure Bob Shell to connect to it. Manually invoke `read_frontend_schema` and `write_frontend_schema` via Bob CLI. Verify both tools work end-to-end. | Bob can list tools, read files, and write files through MCP |

### 2.4 Module Specifications

#### 2.4.1 Configuration Module (`src/config.ts`)

```typescript
// src/config.ts
import path from 'path';

/**
 * Base path to the local clone of Repo B (frontend).
 * In CI: set by the GitHub Action after cloning.
 * Locally: defaults to ./repo-b relative to CWD.
 */
export const REPO_B_BASE_PATH: string = path.resolve(
  process.env.REPO_B_PATH || './repo-b'
);

/**
 * Whitelist of files the MCP tools are allowed to read/write.
 * Relative to REPO_B_BASE_PATH.
 * SECURITY: Only these files are accessible — all other paths are rejected.
 */
export const ALLOWED_FILES: string[] = [
  'src/types.ts',
  'src/schemas.ts',
];

/**
 * Port the MCP server listens on.
 * In CI: can be configured via env.
 * Locally: defaults to 3002.
 */
export const PORT: number = parseInt(process.env.MCP_PORT || '3002', 10);

/**
 * Server metadata for MCP registration.
 */
export const SERVER_NAME = 'aegis-context-bridge';
export const SERVER_VERSION = '1.0.0';
```

#### 2.4.2 Validation Module (`src/validation.ts`)

```typescript
// src/validation.ts
import path from 'path';
import { REPO_B_BASE_PATH, ALLOWED_FILES } from './config';

/**
 * Custom error class for MCP tool errors.
 * Provides structured error information for the agent.
 */
export class McpToolError extends Error {
  constructor(
    public readonly code: 'FILE_NOT_ALLOWED' | 'PATH_TRAVERSAL' | 'FILE_NOT_FOUND' | 'WRITE_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

/**
 * Validates that a file path is:
 * 1. In the ALLOWED_FILES whitelist
 * 2. Does not escape the REPO_B_BASE_PATH boundary (no path traversal)
 *
 * Returns the fully resolved absolute path if valid.
 * Throws McpToolError if invalid.
 */
export function validateAndResolvePath(filePath: string): string {
  // Step 1: Check against whitelist
  if (!ALLOWED_FILES.includes(filePath)) {
    throw new McpToolError(
      'FILE_NOT_ALLOWED',
      `File "${filePath}" is not in the allowed files list. Allowed: ${ALLOWED_FILES.join(', ')}`
    );
  }

  // Step 2: Resolve to absolute path and check boundary
  const resolvedPath = path.resolve(REPO_B_BASE_PATH, filePath);
  const resolvedBase = path.resolve(REPO_B_BASE_PATH);

  // Ensure the resolved path starts with the base path
  // (prevents ../../../etc/passwd style attacks even if somehow in allowlist)
  if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
    throw new McpToolError(
      'PATH_TRAVERSAL',
      `Path traversal detected: "${filePath}" resolves outside the allowed directory`
    );
  }

  return resolvedPath;
}
```

#### 2.4.3 `read_frontend_schema` Tool (`src/tools/readFrontendSchema.ts`)

**MCP Tool Registration Schema:**

```json
{
  "name": "read_frontend_schema",
  "description": "Reads a TypeScript type definition file or Zod schema file from the frontend repository (Repo B). Use this tool to understand the current frontend data contracts before making changes. Returns the complete file content along with metadata.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filePath": {
        "type": "string",
        "description": "Relative path to the file within the frontend repo. Allowed values: 'src/types.ts' (TypeScript interfaces) or 'src/schemas.ts' (Zod validation schemas).",
        "enum": ["src/types.ts", "src/schemas.ts"]
      }
    },
    "required": ["filePath"]
  }
}
```

**Handler Implementation:**

```typescript
// src/tools/readFrontendSchema.ts
import { readFile } from 'fs/promises';
import { validateAndResolvePath, McpToolError } from '../validation';

interface ReadInput {
  filePath: string;
}

interface ReadOutput {
  filePath: string;
  content: string;
  lineCount: number;
  sizeBytes: number;
}

/**
 * Reads a frontend schema/type file from the local Repo B clone.
 *
 * Security: File path is validated against an allowlist and checked
 * for path traversal before any filesystem access.
 *
 * @param input - Contains filePath (relative to Repo B root)
 * @returns File content with metadata
 * @throws McpToolError if file is not allowed, path traversal detected, or file not found
 */
export async function readFrontendSchema(input: ReadInput): Promise<ReadOutput> {
  // Validate and resolve path (throws on invalid)
  const absolutePath = validateAndResolvePath(input.filePath);

  // Read file
  let content: string;
  try {
    content = await readFile(absolutePath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new McpToolError('FILE_NOT_FOUND', `File not found: ${input.filePath}`);
    }
    throw err; // Re-throw unexpected errors
  }

  return {
    filePath: input.filePath,
    content,
    lineCount: content.split('\n').length,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
  };
}
```

#### 2.4.4 `write_frontend_schema` Tool (`src/tools/writeFrontendSchema.ts`)

**MCP Tool Registration Schema:**

```json
{
  "name": "write_frontend_schema",
  "description": "Overwrites a TypeScript type definition file or Zod schema file in the frontend repository (Repo B). Use this tool after generating updated code that matches the new backend API contract. WARNING: This performs a FULL OVERWRITE of the file — you must provide the complete new file content, not just a diff or patch.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "filePath": {
        "type": "string",
        "description": "Relative path to the file within the frontend repo. Allowed values: 'src/types.ts' (TypeScript interfaces) or 'src/schemas.ts' (Zod validation schemas).",
        "enum": ["src/types.ts", "src/schemas.ts"]
      },
      "content": {
        "type": "string",
        "description": "The complete new file content to write. Must be valid TypeScript code. Include all imports, exports, comments, and type definitions."
      }
    },
    "required": ["filePath", "content"]
  }
}
```

**Handler Implementation:**

```typescript
// src/tools/writeFrontendSchema.ts
import { writeFile } from 'fs/promises';
import { validateAndResolvePath, McpToolError } from '../validation';

interface WriteInput {
  filePath: string;
  content: string;
}

interface WriteOutput {
  filePath: string;
  bytesWritten: number;
  lineCount: number;
  success: true;
}

/**
 * Writes (overwrites) a frontend schema/type file in the local Repo B clone.
 *
 * This is a FULL OVERWRITE operation — the entire file content is replaced.
 * The calling agent must provide the complete desired file content.
 *
 * Security: File path is validated against an allowlist and checked
 * for path traversal before any filesystem access.
 *
 * @param input - Contains filePath and complete new content
 * @returns Write confirmation with metadata
 * @throws McpToolError if file is not allowed, path traversal detected, or write fails
 */
export async function writeFrontendSchema(input: WriteInput): Promise<WriteOutput> {
  // Validate and resolve path (throws on invalid)
  const absolutePath = validateAndResolvePath(input.filePath);

  // Validate content is non-empty
  if (!input.content || input.content.trim().length === 0) {
    throw new McpToolError('WRITE_FAILED', 'Cannot write empty content to file');
  }

  // Write file
  try {
    await writeFile(absolutePath, input.content, 'utf-8');
  } catch (err: any) {
    throw new McpToolError('WRITE_FAILED', `Failed to write file: ${err.message}`);
  }

  return {
    filePath: input.filePath,
    bytesWritten: Buffer.byteLength(input.content, 'utf-8'),
    lineCount: input.content.split('\n').length,
    success: true,
  };
}
```

> **Design Decision — Full Overwrite vs. Patch:** The `write_frontend_schema` tool does a full file overwrite rather than applying a diff/patch. This is a deliberate choice for the hackathon:
> - **Simpler implementation** — no diff parsing or merge conflict resolution
> - **Simpler agent prompting** — the agent generates the complete desired file, no partial edit instructions
> - **More reliable** — no risk of patch misapplication or context mismatch
> - **Trade-off:** The agent must include ALL existing content it wants to preserve. For our small files (~10-20 lines), this is a negligible cost.

#### 2.4.5 Server Entry Point (`src/index.ts`)

```typescript
// src/index.ts
import { McpServer } from '@anthropic-ai/mcp-sdk'; // Verify actual import for IBM Bob MCP SDK
import express from 'express';
import { readFrontendSchema } from './tools/readFrontendSchema';
import { writeFrontendSchema } from './tools/writeFrontendSchema';
import { PORT, SERVER_NAME, SERVER_VERSION, REPO_B_BASE_PATH, ALLOWED_FILES } from './config';
import { McpToolError } from './validation';

// ───── Express App (for health check) ─────
const app = express();

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    server: SERVER_NAME,
    version: SERVER_VERSION,
    config: {
      repoBPath: REPO_B_BASE_PATH,
      allowedFiles: ALLOWED_FILES,
      port: PORT,
    },
    tools: ['read_frontend_schema', 'write_frontend_schema'],
  });
});

// ───── MCP Server ─────
const mcpServer = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

// Register: read_frontend_schema
mcpServer.tool(
  'read_frontend_schema',
  'Reads a TypeScript type or Zod schema file from the frontend repo (Repo B).',
  {
    filePath: {
      type: 'string',
      description: "Relative path: 'src/types.ts' or 'src/schemas.ts'",
      enum: ['src/types.ts', 'src/schemas.ts'],
    },
  },
  async ({ filePath }) => {
    try {
      const result = await readFrontendSchema({ filePath });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      if (err instanceof McpToolError) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: true, code: err.code, message: err.message }) }], isError: true };
      }
      throw err;
    }
  }
);

// Register: write_frontend_schema
mcpServer.tool(
  'write_frontend_schema',
  'Overwrites a TypeScript type or Zod schema file in the frontend repo (Repo B). Provide complete file content.',
  {
    filePath: {
      type: 'string',
      description: "Relative path: 'src/types.ts' or 'src/schemas.ts'",
      enum: ['src/types.ts', 'src/schemas.ts'],
    },
    content: {
      type: 'string',
      description: 'The complete new file content (valid TypeScript).',
    },
  },
  async ({ filePath, content }) => {
    try {
      const result = await writeFrontendSchema({ filePath, content });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      if (err instanceof McpToolError) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: true, code: err.code, message: err.message }) }], isError: true };
      }
      throw err;
    }
  }
);

// ───── Start ─────
app.listen(PORT, () => {
  console.log(`[Aegis MCP] Context Bridge server listening on port ${PORT}`);
  console.log(`[Aegis MCP] Repo B path: ${REPO_B_BASE_PATH}`);
  console.log(`[Aegis MCP] Allowed files: ${ALLOWED_FILES.join(', ')}`);
  console.log(`[Aegis MCP] Health check: http://localhost:${PORT}/health`);
});

// Connect MCP transport (stdio or HTTP — depends on Bob Shell's connection method)
// For stdio transport (typical for MCP):
// mcpServer.connect(new StdioServerTransport());
// For HTTP transport:
// mcpServer.connect(new HttpServerTransport({ port: PORT + 1 }));
```

### 2.5 Unit Test Specifications

#### Test Cases for `read_frontend_schema`

| Test | Input | Expected Result |
|------|-------|-----------------|
| Happy path: read types.ts | `{ filePath: "src/types.ts" }` | Returns content of the file, correct line count, correct byte size |
| Happy path: read schemas.ts | `{ filePath: "src/schemas.ts" }` | Returns content of the file with metadata |
| Error: file not in allowlist | `{ filePath: "src/server.ts" }` | Throws `McpToolError` with code `FILE_NOT_ALLOWED` |
| Error: path traversal attempt | `{ filePath: "../../etc/passwd" }` | Throws `McpToolError` with code `FILE_NOT_ALLOWED` (caught by allowlist before traversal check) |
| Error: file not found | `{ filePath: "src/types.ts" }` (with file deleted) | Throws `McpToolError` with code `FILE_NOT_FOUND` |

#### Test Cases for `write_frontend_schema`

| Test | Input | Expected Result |
|------|-------|-----------------|
| Happy path: write types.ts | `{ filePath: "src/types.ts", content: "export interface User { ... }" }` | File overwritten, returns success with byte count |
| Happy path: write schemas.ts | `{ filePath: "src/schemas.ts", content: "import { z } from 'zod'; ..." }` | File overwritten, returns success |
| Error: empty content | `{ filePath: "src/types.ts", content: "" }` | Throws `McpToolError` with code `WRITE_FAILED` |
| Error: file not in allowlist | `{ filePath: "package.json", content: "..." }` | Throws `McpToolError` with code `FILE_NOT_ALLOWED` |
| Verify overwrite behavior | Write content A, then write content B to same file | File contains only content B (complete overwrite confirmed) |

#### Test Cases for Validation Module

| Test | Input | Expected Result |
|------|-------|-----------------|
| Valid path: src/types.ts | `"src/types.ts"` | Returns resolved absolute path |
| Valid path: src/schemas.ts | `"src/schemas.ts"` | Returns resolved absolute path |
| Invalid: not in allowlist | `"src/other.ts"` | Throws `FILE_NOT_ALLOWED` |
| Invalid: traversal with ../ | `"../../../etc/passwd"` | Throws (caught by allowlist or traversal check) |
| Invalid: absolute path | `"/etc/passwd"` | Throws `FILE_NOT_ALLOWED` |
| Invalid: dot-dot in allowlisted name | Craft input where name matches but resolves outside | Throws `PATH_TRAVERSAL` |

### Phase 2 Completion Gate

All of the following must be true before proceeding to Phase 3:

- [ ] MCP server starts cleanly and logs tool registration
- [ ] `GET /health` returns 200 with correct tool list and config
- [ ] `read_frontend_schema("src/types.ts")` returns correct file content
- [ ] `read_frontend_schema("src/schemas.ts")` returns correct file content
- [ ] `write_frontend_schema("src/types.ts", <content>)` overwrites file correctly
- [ ] `write_frontend_schema("src/schemas.ts", <content>)` overwrites file correctly
- [ ] Path traversal attempts (`../../etc/passwd`) are blocked with appropriate error
- [ ] Non-allowlisted file access (`package.json`, `server.ts`) is blocked
- [ ] Empty content writes are rejected
- [ ] All unit tests pass (`npm test`)
- [ ] Bob Shell can connect to the MCP server and list both tools
- [ ] Bob Shell can manually invoke both tools and see correct results

---

## Phase 3: Bob Shell & CI/CD Pipeline Integration (Hours 8–14)

**Goal:** Wire everything together inside a GitHub Actions workflow. When a PR is opened on Repo A, the Action clones Repo B, starts the MCP server, runs Bob Shell headlessly, and pushes the result as a PR to Repo B.

**Time Budget:** 6 hours  
**Dependencies:** Phase 1 (repos exist) + Phase 2 (MCP server works)  
**Owner:** DevOps-focused team member

---

### 3.1 Workflow Sequence (Detailed)

The following sequence shows every step that happens when a PR is opened on Repo A:

```
Developer opens PR on Repo A (e.g., rename user_id → uuid)
         │
         ▼
GitHub fires `on: pull_request` webhook
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Step 1: Checkout Repo A (actions/checkout@v4, fetch-depth: 0) │
│  Step 2: Clone Repo B into ./repo-b (using PAT)                │
│  Step 3: Setup Node.js 20 (actions/setup-node@v4)              │
│  Step 4: Install Repo B dependencies (npm ci in ./repo-b)      │
│  Step 5: Install MCP server dependencies (npm ci in mcp-server)│
│  Step 6: Build MCP server (npm run build in mcp-server)        │
│  Step 7: Start MCP server in background (&)                    │
│  Step 8: Wait for MCP health check (poll /health, max 30s)     │
│  Step 9: Extract PR diff (git diff origin/main..HEAD)          │
│  Step 10: Install IBM Bob 2.0 Shell                            │
│  Step 11: Run Bob Shell headless with master prompt + diff      │
│       │                                                         │
│       ├─── Planner: Analyzes diff for breaking changes          │
│       ├─── Implementer: read → generate → write via MCP        │
│       └─── Critic: npm run type-check in ./repo-b               │
│            ├─── Pass → continue                                 │
│            └─── Fail → retry (max 3 attempts)                  │
│                                                                 │
│  Step 12: Verify type-check passes (safety net)                │
│  Step 13: Create branch in ./repo-b                            │
│  Step 14: Commit changes with descriptive message               │
│  Step 15: Push branch to Repo B (using PAT)                    │
│  Step 16: Create PR on Repo B (using gh CLI)                   │
│  Step 17: Cleanup — kill MCP server process                    │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
Auto-generated PR appears on Repo B with synced types
```

### 3.2 GitHub Actions Workflow File

File: `repo-a-backend/.github/workflows/aegis.yml`

```yaml
# ──────────────────────────────────────────────────────────────────
# Project Aegis — Autonomous Contract Synchronization
# ──────────────────────────────────────────────────────────────────
# Triggered when a PR is opened/updated on the backend repository.
# Detects breaking API contract changes and automatically generates
# a synchronized PR on the frontend repository with updated types.
# ──────────────────────────────────────────────────────────────────

name: "🛡️ Project Aegis — Contract Sync"

on:
  pull_request:
    types: [opened, synchronize]
    paths:
      - 'src/server.ts'   # Only trigger when the API source file changes

permissions:
  contents: read
  pull-requests: read

jobs:
  aegis-sync:
    name: "Detect & Sync Frontend Contracts"
    runs-on: ubuntu-latest
    timeout-minutes: 15   # Hard timeout to prevent runaway agent loops

    env:
      REPO_B_PATH: ./repo-b
      MCP_PORT: "3002"
      FRONTEND_REPO: Aegis-Enclave/repo-b-frontend

    steps:
      # ═══════════════════════════════════════════════════
      # STAGE 1: Environment Setup
      # ═══════════════════════════════════════════════════

      - name: "📥 Checkout Repo A (Backend)"
        uses: actions/checkout@v4
        with:
          fetch-depth: 0   # Full history needed for accurate git diff

      - name: "📥 Clone Repo B (Frontend) into ./repo-b"
        run: |
          echo "::group::Cloning frontend repository"
          git clone \
            --depth 1 \
            https://x-access-token:${{ secrets.FRONTEND_REPO_PAT }}@github.com/${{ env.FRONTEND_REPO }}.git \
            ${{ env.REPO_B_PATH }}
          echo "::endgroup::"
          echo "✅ Repo B cloned to ${{ env.REPO_B_PATH }}"
          ls -la ${{ env.REPO_B_PATH }}/src/

      - name: "🟢 Setup Node.js 20"
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      # ═══════════════════════════════════════════════════
      # STAGE 2: Install Dependencies
      # ═══════════════════════════════════════════════════

      - name: "📦 Install Repo B dependencies"
        working-directory: ${{ env.REPO_B_PATH }}
        run: npm ci

      - name: "📦 Install MCP Server dependencies"
        working-directory: ./mcp-server
        run: npm ci

      - name: "🔨 Build MCP Server"
        working-directory: ./mcp-server
        run: npm run build

      # ═══════════════════════════════════════════════════
      # STAGE 3: Start MCP Context Bridge
      # ═══════════════════════════════════════════════════

      - name: "🌉 Start MCP Context Bridge Server"
        run: |
          echo "Starting MCP server on port ${{ env.MCP_PORT }}..."
          cd mcp-server && node dist/index.js &
          MCP_PID=$!
          echo "MCP_PID=${MCP_PID}" >> $GITHUB_ENV
          echo "MCP server started with PID ${MCP_PID}"

          # Health check polling loop (max 30 seconds)
          echo "Waiting for MCP server to become ready..."
          for i in $(seq 1 30); do
            if curl -sf http://localhost:${{ env.MCP_PORT }}/health > /dev/null 2>&1; then
              echo "✅ MCP server is ready (took ${i}s)"
              curl -s http://localhost:${{ env.MCP_PORT }}/health | jq .
              break
            fi
            if [ $i -eq 30 ]; then
              echo "❌ MCP server failed to start within 30 seconds"
              exit 1
            fi
            sleep 1
          done
        env:
          REPO_B_PATH: ${{ env.REPO_B_PATH }}

      # ═══════════════════════════════════════════════════
      # STAGE 4: Extract Context
      # ═══════════════════════════════════════════════════

      - name: "📊 Extract PR Diff"
        run: |
          echo "::group::Backend API Diff"
          git diff origin/main..HEAD -- src/server.ts > /tmp/backend-diff.patch
          cat /tmp/backend-diff.patch
          echo "::endgroup::"

          # Validate diff is non-empty
          if [ ! -s /tmp/backend-diff.patch ]; then
            echo "⚠️ No changes detected in src/server.ts"
            echo "SKIP_AEGIS=true" >> $GITHUB_ENV
          else
            DIFF_LINES=$(wc -l < /tmp/backend-diff.patch)
            echo "📝 Diff contains ${DIFF_LINES} lines"
          fi

      # ═══════════════════════════════════════════════════
      # STAGE 5: Run IBM Bob 2.0 Agent Loop
      # ═══════════════════════════════════════════════════

      - name: "🤖 Install IBM Bob 2.0 Shell"
        if: env.SKIP_AEGIS != 'true'
        run: |
          # IBM Bob 2.0 installation
          # NOTE: Replace with actual Bob 2.0 install command
          # This is a placeholder — verify the actual installation method
          npm install -g @anthropic-ai/bob-shell   # Placeholder package name
          echo "✅ Bob Shell installed"
          bob --version || echo "Verify bob command is available"

      - name: "🧠 Execute Aegis Agent Loop"
        if: env.SKIP_AEGIS != 'true'
        run: |
          echo "::group::Aegis Agent Execution"

          # Inject the diff into the master prompt
          export BACKEND_DIFF="$(cat /tmp/backend-diff.patch)"

          # Run Bob Shell in headless mode with MCP configuration
          bob shell --headless \
            --mcp-config ./mcp-config.json \
            --prompt "$(cat ./prompts/aegis-master-prompt.md)" \
            --context "BACKEND_DIFF=${BACKEND_DIFF}" \
            --max-iterations 5 \
            --timeout 300

          echo "::endgroup::"
          echo "✅ Aegis agent loop completed"
        env:
          BOB_API_KEY: ${{ secrets.BOB_API_KEY }}
          REPO_B_PATH: ${{ env.REPO_B_PATH }}

      # ═══════════════════════════════════════════════════
      # STAGE 6: Validate Changes
      # ═══════════════════════════════════════════════════

      - name: "✅ Final Type-Check Validation"
        if: env.SKIP_AEGIS != 'true'
        working-directory: ${{ env.REPO_B_PATH }}
        run: |
          echo "Running final type-check as safety net..."
          npm run type-check
          echo "✅ Type-check passed — changes are valid"

      - name: "🔍 Show Changes Made"
        if: env.SKIP_AEGIS != 'true'
        working-directory: ${{ env.REPO_B_PATH }}
        run: |
          echo "::group::Changes made by Aegis"
          git diff
          echo "::endgroup::"

      # ═══════════════════════════════════════════════════
      # STAGE 7: Create Frontend PR
      # ═══════════════════════════════════════════════════

      - name: "🚀 Push Changes & Create Frontend PR"
        if: env.SKIP_AEGIS != 'true'
        working-directory: ${{ env.REPO_B_PATH }}
        run: |
          # Configure git identity
          git config user.name "Project Aegis Bot"
          git config user.email "aegis-bot@noreply.github.com"

          # Create a unique branch name
          BRANCH="aegis/sync-pr${{ github.event.pull_request.number }}-$(date +%Y%m%d%H%M%S)"
          echo "Creating branch: ${BRANCH}"
          git checkout -b "${BRANCH}"

          # Stage and commit
          git add -A
          git commit -m "chore: sync frontend types with backend PR #${{ github.event.pull_request.number }}

          Automated by Project Aegis — Contract Sync Agent

          Backend PR: ${{ github.event.pull_request.html_url }}
          Changes detected in: src/server.ts
          Files updated: src/types.ts, src/schemas.ts
          Validation: npm run type-check ✅ passed"

          # Push to Repo B
          git push origin "${BRANCH}"
          echo "✅ Branch pushed to Repo B"

          # Create Pull Request using GitHub CLI
          gh pr create \
            --repo "${{ env.FRONTEND_REPO }}" \
            --head "${BRANCH}" \
            --base "main" \
            --title "🛡️ Aegis: Sync types with backend PR #${{ github.event.pull_request.number }}" \
            --body "## 🛡️ Automated Contract Synchronization

          This PR was automatically generated by **Project Aegis**.

          ### 📋 What happened
          A breaking change was detected in the backend API ([PR #${{ github.event.pull_request.number }}](${{ github.event.pull_request.html_url }})).

          Project Aegis analyzed the diff, updated the frontend TypeScript interfaces and Zod schemas, and validated the changes.

          ### 📁 Files Updated
          - \`src/types.ts\` — TypeScript interface updated
          - \`src/schemas.ts\` — Zod validation schema updated

          ### ✅ Validation
          - \`npm run type-check\` — **Passed**

          ### 🏗️ Architecture
          \`\`\`
          Backend PR → GitHub Action → IBM Bob 2.0 + MCP → Type-Check → Frontend PR
          \`\`\`

          ---
          *Powered by IBM Bob 2.0 + Model Context Protocol (MCP)*
          *Team: Aegis Enclave*"
        env:
          GH_TOKEN: ${{ secrets.FRONTEND_REPO_PAT }}

      # ═══════════════════════════════════════════════════
      # STAGE 8: Cleanup
      # ═══════════════════════════════════════════════════

      - name: "🧹 Cleanup — Stop MCP Server"
        if: always()
        run: |
          if [ -n "${MCP_PID}" ]; then
            echo "Stopping MCP server (PID: ${MCP_PID})..."
            kill ${MCP_PID} 2>/dev/null || true
            echo "✅ MCP server stopped"
          fi
```

### 3.3 MCP Configuration File

File: `repo-a-backend/mcp-config.json`

```json
{
  "mcpServers": {
    "aegis-context-bridge": {
      "command": "node",
      "args": ["mcp-server/dist/index.js"],
      "env": {
        "REPO_B_PATH": "./repo-b",
        "MCP_PORT": "3002"
      }
    }
  }
}
```

> **Note on MCP Transport:** The `mcp-config.json` above uses the `command` pattern, which means Bob Shell will launch the MCP server as a child process and communicate via **stdio transport**. If Bob Shell requires HTTP transport instead, adjust the config to use `url: "http://localhost:3002"` and rely on the GitHub Action starting the server separately (as already implemented in the workflow).

### 3.4 Implementation Tasks

| # | Task | Technical Details | Acceptance Criteria |
|---|------|-------------------|---------------------|
| 3.4.1 | Write `aegis.yml` | Complete GitHub Actions workflow YAML per specification above. Place at `.github/workflows/aegis.yml` in Repo A. | YAML lint passes (`actionlint` or online validator); workflow appears in GitHub Actions tab |
| 3.4.2 | Create `mcp-config.json` | Bob Shell MCP server configuration pointing to local MCP server. Place at repo root. | JSON is valid; Bob Shell can parse it |
| 3.4.3 | Configure secrets in Repo A | Verify `BOB_API_KEY` and `FRONTEND_REPO_PAT` are set in Repo A → Settings → Secrets → Actions | Both secrets accessible in workflow (test with `echo ${#SECRET}` to verify length > 0) |
| 3.4.4 | Test: Repo B clone step | Push workflow, trigger with a test PR, verify Repo B is cloned into `./repo-b` | Workflow logs show successful clone and `ls` of `src/` directory |
| 3.4.5 | Test: MCP server startup | Verify MCP server starts in background and health check passes | Workflow logs show `✅ MCP server is ready` with health response JSON |
| 3.4.6 | Test: Diff extraction | Verify `git diff` correctly captures changes between PR branch and `main` | Workflow logs show the diff content in the `Backend API Diff` group |
| 3.4.7 | Test: Bob Shell execution | Verify Bob Shell starts headlessly, connects to MCP, and produces output | Workflow logs show Bob's reasoning and tool calls |
| 3.4.8 | Test: Git push to Repo B | Verify branch creation, commit, and push succeed with PAT authentication | New branch appears in Repo B on GitHub |
| 3.4.9 | Test: PR creation on Repo B | Verify `gh pr create` produces a well-formatted PR | PR appears in Repo B with correct title, body, and source branch |
| 3.4.10 | Test: Cleanup runs on failure | Force a failure mid-workflow, verify MCP server is still killed | `if: always()` cleanup step executes; no orphaned processes |
| 3.4.11 | Test: Full end-to-end | Open a real PR renaming `user_id` → `uuid`, let entire pipeline run | Frontend PR created with correctly updated `types.ts` and `schemas.ts` |

### 3.5 Troubleshooting Guide

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| Clone fails with 401 | PAT expired or insufficient permissions | Regenerate PAT with correct repo and permissions |
| MCP health check times out | Server crash on startup | Check server logs; ensure `REPO_B_PATH` exists |
| Bob Shell can't find tools | MCP config path wrong or transport mismatch | Verify `mcp-config.json` path relative to CWD in workflow |
| `gh pr create` fails with 422 | Branch already exists or base branch wrong | Add timestamp to branch name; verify `--base main` |
| Diff is empty | PR doesn't modify `src/server.ts` | Check `paths` filter in workflow trigger |
| Type-check fails after Bob runs | Bob generated invalid TypeScript | Check Critic retry loop; review Bob's output logs |

### Phase 3 Completion Gate

- [ ] GitHub Action triggers correctly on PR to Repo A
- [ ] Repo B is cloned successfully into `./repo-b` within the runner
- [ ] MCP server starts in background and passes health check within 30s
- [ ] PR diff is extracted correctly and is non-empty for API changes
- [ ] Bob Shell starts headlessly and connects to MCP tools
- [ ] Bob Shell can invoke `read_frontend_schema` and `write_frontend_schema` during execution
- [ ] Git operations (branch, commit, push) succeed with PAT auth
- [ ] `gh pr create` produces a correctly formatted PR on Repo B
- [ ] Cleanup step kills MCP server even on workflow failure
- [ ] Full end-to-end dry run succeeds (PR on A → auto PR on B)

---

## Phase 4: Prompt Engineering & Actor-Critic Loop (Hours 14–18)

**Goal:** Design and iterate on the multi-agent prompt chain that powers Bob's autonomous reasoning. Implement the Planner→Implementer→Critic loop with structured retry logic.

**Time Budget:** 4 hours  
**Dependencies:** Phase 2 (MCP tools work) + Phase 3 (CI pipeline runs Bob)  
**Owner:** Full team (prompt engineering is iterative and benefits from multiple perspectives)

---

### 4.1 Agent Architecture — State Machine

```
                              ┌──────────────────────┐
                              │     Entry Point       │
                              │  (Master Prompt)      │
                              └──────────┬─────────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │   PLANNER PHASE       │
                              │                       │
                              │  1. Read git diff     │
                              │  2. Identify breaking │
                              │     changes           │
                              │  3. List affected     │
                              │     fields            │
                              └──────────┬─────────────┘
                                         │
                            ┌────────────┴────────────┐
                            │                          │
                            ▼                          ▼
                 ┌──────────────────┐      ┌──────────────────┐
                 │ NO BREAKING      │      │ BREAKING CHANGES │
                 │ CHANGES          │      │ DETECTED         │
                 │                  │      │                  │
                 │ Report & Exit    │      │ Proceed to       │
                 │ (no action       │      │ implementation   │
                 │  needed)         │      │                  │
                 └──────────────────┘      └──────────┬───────┘
                                                      │
                                         ┌────────────▼────────────┐
                                         │   IMPLEMENTER PHASE     │  ◄─────┐
                                         │                         │        │
                                         │  1. read_frontend_      │        │
                                         │     schema(types.ts)    │        │
                                         │  2. read_frontend_      │        │
                                         │     schema(schemas.ts)  │        │
                                         │  3. Generate updated    │        │
                                         │     code                │        │
                                         │  4. write_frontend_     │        │
                                         │     schema(types.ts)    │        │
                                         │  5. write_frontend_     │        │
                                         │     schema(schemas.ts)  │        │
                                         └────────────┬────────────┘        │
                                                      │                     │
                                                      ▼                     │
                                         ┌────────────────────────┐         │
                                         │   CRITIC PHASE          │         │
                                         │                         │         │
                                         │  Run: npm run type-     │         │
                                         │  check in ./repo-b      │         │
                                         └────────────┬────────────┘         │
                                                      │                     │
                                         ┌────────────┴────────────┐        │
                                         │                          │        │
                                         ▼                          ▼        │
                              ┌──────────────────┐      ┌──────────────┐    │
                              │ EXIT CODE 0       │      │ EXIT CODE    │    │
                              │ (type-check       │      │ NON-ZERO     │    │
                              │  passes)          │      │ (errors)     │    │
                              │                   │      │              │    │
                              │ SYNC_COMPLETE ✅  │      │ Attempt < 3? │    │
                              └──────────────────┘      └──────┬───────┘    │
                                                               │            │
                                                    ┌──────────┴──────┐     │
                                                    │                  │     │
                                                    ▼                  ▼     │
                                            ┌──────────┐      ┌────────────┐│
                                            │ YES      │      │ NO         ││
                                            │          │      │            ││
                                            │ Feed     │      │ FAIL ❌    ││
                                            │ stderr   ├──────►            ││
                                            │ back     │      │ Max retries││
                                            └──────────┘      │ exceeded   ││
                                                 │             └────────────┘│
                                                 └───────────────────────────┘
```

### 4.2 Master Prompt Specification

File: `repo-a-backend/prompts/aegis-master-prompt.md`

```markdown
# Project Aegis — Autonomous Contract Synchronization Agent

You are **Project Aegis**, an autonomous CI/CD agent. Your mission is to maintain
type-safety across a microservice boundary by keeping the frontend data contracts
in sync with the backend API.

## Situation

A Pull Request has been opened on the **backend repository** (Node.js/Express).
The diff of the changed API code is provided below. Your job is to:

1. Determine if this change breaks the frontend data contract
2. If it does, fix the frontend TypeScript interfaces and Zod schemas
3. Validate your fixes compile correctly

## Available MCP Tools

You have access to two tools via the MCP Context Bridge:

### `read_frontend_schema`
- **Purpose:** Read a frontend type/schema file from the local clone of Repo B
- **Input:** `{ "filePath": "src/types.ts" }` or `{ "filePath": "src/schemas.ts" }`
- **Output:** The complete file content with metadata (line count, byte size)
- **When to use:** ALWAYS read both files before making any changes

### `write_frontend_schema`
- **Purpose:** Overwrite a frontend type/schema file in the local clone of Repo B
- **Input:** `{ "filePath": "src/types.ts", "content": "<complete file content>" }`
- **Output:** Confirmation with bytes written
- **When to use:** After generating the corrected code
- **⚠️ IMPORTANT:** This is a FULL OVERWRITE. You must provide the COMPLETE file
  content, including all imports, exports, comments, and unchanged code.

## Your Execution Plan

### Step 1: ANALYZE (Planner Phase)
Carefully read the backend diff below. For each change, determine:
- What field was renamed, added, removed, or had its type changed?
- Would this cause the frontend `User` TypeScript interface to be incorrect?
- Would this cause the frontend `UserSchema` Zod object to be incorrect?

If NO breaking changes are detected, respond with:
```
RESULT: NO_BREAKING_CHANGES
REASON: <explanation of why the diff does not affect the frontend contract>
```
and STOP. Do not proceed to Step 2.

If breaking changes ARE detected, list them:
```
BREAKING CHANGES DETECTED:
• <field>: <old value> → <new value> — affects <file(s)>
```

### Step 2: READ (Information Gathering)
Call `read_frontend_schema` for BOTH files:
1. `read_frontend_schema({ "filePath": "src/types.ts" })`
2. `read_frontend_schema({ "filePath": "src/schemas.ts" })`

Read the returned content carefully. Note the current structure, imports, exports,
and comments.

### Step 3: GENERATE (Implementer Phase)
Generate the updated code for EACH file. Your updated code must:
- Apply ONLY the changes identified in Step 1
- Preserve ALL existing imports, exports, and code structure
- Preserve ALL existing comments
- NOT add any new fields that aren't in the diff
- NOT remove any fields that aren't affected by the diff
- Use the EXACT same field names, types, and enum values as the new backend contract
- Be complete, valid TypeScript

### Step 4: WRITE (Apply Changes)
Call `write_frontend_schema` for EACH file:
1. `write_frontend_schema({ "filePath": "src/types.ts", "content": "<complete new content>" })`
2. `write_frontend_schema({ "filePath": "src/schemas.ts", "content": "<complete new content>" })`

### Step 5: VALIDATE (Critic Phase)
After writing both files, the CI runner will execute `npm run type-check` in the
frontend directory. This runs `tsc --noEmit` to verify all TypeScript types are
consistent.

- **If type-check PASSES (exit code 0):** Report success:
  ```
  RESULT: SYNC_COMPLETE
  CHANGES:
  • <summary of each change made>
  VALIDATION: type-check passed ✅
  ```

- **If type-check FAILS (exit code non-zero):** Read the error output carefully.
  Identify the specific issue. Go back to Step 3 and fix ONLY the errors reported.
  You have a maximum of 3 total attempts.

## Critical Rules

1. **NEVER invent fields.** Only modify what the backend diff changes. If the diff
   renames `user_id` to `uuid`, you rename `user_id` to `uuid` — nothing else.

2. **ALWAYS generate complete files.** The write tool does full overwrites. If you
   omit existing code, it will be deleted.

3. **Update BOTH files.** If the TypeScript interface and Zod schema both reference
   the changed field, both must be updated.

4. **Preserve formatting.** Keep the same indentation style, comment style, and
   code organization as the original files.

5. **No extra imports.** Don't add imports that weren't in the original files unless
   absolutely required by the changes.

## Backend Diff

The following is the `git diff` output for the backend API changes:

```diff
${BACKEND_DIFF}
```

Begin your analysis now. Start with Step 1.
```

### 4.3 Retry Prompt Template

When the Critic phase detects a type-check failure, the following template is used to construct the retry prompt:

```markdown
## Type-Check Failed — Retry Attempt ${ATTEMPT}/${MAX_ATTEMPTS}

The TypeScript type-check (`tsc --noEmit`) failed with the following errors:

```
${STDERR_OUTPUT}
```

Analyze these errors carefully:
1. What specific file(s) and line(s) have errors?
2. What is the root cause of each error?
3. What needs to change to fix each error?

Now:
1. Call `read_frontend_schema` to see the current state of the files you wrote
2. Generate corrected code that fixes the reported errors
3. Call `write_frontend_schema` with the corrected code
4. The type-check will run again automatically

Remember: Generate the COMPLETE file content, not just the fix.
```

### 4.4 Expected Agent Behavior — Worked Example

For the demo scenario (`user_id` → `uuid`), here's what the agent should produce:

**Planner Output:**
```
BREAKING CHANGES DETECTED:
• Field `user_id` (string) renamed to `uuid` (string) — affects src/types.ts (User interface, line 7) and src/schemas.ts (UserSchema, line 8)
```

**Implementer — Updated `types.ts`:**
```typescript
// src/types.ts
//
// Frontend data contract for the User entity.
// This interface MUST match the backend API response shape (Repo A: GET /api/user).
// Project Aegis automatically keeps this in sync when the backend changes.

export interface User {
  uuid: string;       // Unique user identifier — matches backend field name
  name: string;       // User's display name
  email: string;      // User's email address
  role: 'admin' | 'member' | 'viewer';  // User's permission level
}
```

**Implementer — Updated `schemas.ts`:**
```typescript
// src/schemas.ts
//
// Zod runtime validation schema for the User entity.
// Provides runtime type safety on top of TypeScript's compile-time checks.
// MUST stay in sync with the TypeScript interface in types.ts.

import { z } from 'zod';

export const UserSchema = z.object({
  uuid: z.string(),                                  // Matches User.uuid
  name: z.string(),                                  // Matches User.name
  email: z.string().email(),                         // Matches User.email (with email validation)
  role: z.enum(['admin', 'member', 'viewer']),       // Matches User.role
});

// Inferred type — should be structurally identical to the User interface in types.ts
export type UserFromSchema = z.infer<typeof UserSchema>;
```

**Critic Output:**
```
VALIDATION: npm run type-check exited with code 0
RESULT: SYNC_COMPLETE ✅
```

> **Note:** The `page.tsx` component references `user.user_id` which will now be a type error. For the hackathon scope, this is acceptable — the type-check on `types.ts` and `schemas.ts` is the core demonstration. In a production system, the Implementer agent would also update component files, or the ALLOWED_FILES list would include component files.

### 4.5 Implementation Tasks

| # | Task | Technical Details | Acceptance Criteria |
|---|------|-------------------|---------------------|
| 4.5.1 | Write master prompt | Create `prompts/aegis-master-prompt.md` with full specification above. Use `${BACKEND_DIFF}` placeholder for diff injection. | Prompt is clear, structured, and covers all cases |
| 4.5.2 | Create prompts directory | `mkdir -p prompts/` in Repo A root | Directory exists |
| 4.5.3 | Test: Planner correctness | Feed the `user_id → uuid` diff to Bob with the prompt. Verify it correctly identifies the breaking change. | Bob outputs "BREAKING CHANGES DETECTED" with correct field identified |
| 4.5.4 | Test: Implementer tool calls | Verify Bob calls `read_frontend_schema` for both files, generates correct updated code, and calls `write_frontend_schema` for both files. | All 4 MCP tool calls made in correct order with correct content |
| 4.5.5 | Test: Critic validation | Verify Bob's instructions for running `type-check` are correct and the pipeline interprets the exit code correctly. | Type-check pass → SYNC_COMPLETE; Type-check fail → retry |
| 4.5.6 | Test: No-op case | Create a PR that modifies Repo A's server.ts but does NOT change the User interface (e.g., change the port number). Run Aegis. | Agent outputs NO_BREAKING_CHANGES, no changes to Repo B, no PR created |
| 4.5.7 | Test: Retry recovery | Deliberately introduce a subtle error in the first write (e.g., by modifying the prompt to make a small mistake). Verify the Critic catches it and the Implementer fixes it on retry. | Type-check fails on attempt 1, passes on attempt 2 |
| 4.5.8 | Test: Multiple field changes (stretch) | Create a PR that renames `user_id → uuid` AND changes `role` type from enum to `string`. | Both changes propagated correctly to both files |
| 4.5.9 | Prompt iteration | Run at least 3 full end-to-end cycles with the `user_id → uuid` scenario. Note any inconsistencies in Bob's behavior. Refine prompt wording to improve consistency. | 3 consecutive successful runs with identical output structure |
| 4.5.10 | Document prompt learnings | Note any prompt engineering insights (what worked, what didn't, what phrasing caused issues) in a brief `prompts/NOTES.md` | Notes file exists with actionable observations |

### 4.6 Prompt Engineering Guidelines

Based on general best practices for agentic prompts:

1. **Be explicit about output format.** The master prompt specifies exact output formats (`RESULT: NO_BREAKING_CHANGES`, `RESULT: SYNC_COMPLETE`) to make parsing predictable.

2. **Use numbered steps.** Agents follow numbered instructions more reliably than prose paragraphs.

3. **State negative rules.** "NEVER invent fields" and "NEVER remove unchanged fields" are as important as positive instructions.

4. **Provide context about tools.** Explaining that `write_frontend_schema` is a "full overwrite" prevents the common mistake of writing only the changed lines.

5. **Limit decision space.** The `filePath` input is an enum (`src/types.ts` or `src/schemas.ts`), not a free-form string. This eliminates a class of errors.

6. **Include examples in prompts if needed.** If Bob struggles with the format, add a concrete example of a correct tool call sequence.

### Phase 4 Completion Gate

- [ ] Master prompt written and saved to `prompts/aegis-master-prompt.md`
- [ ] Planner correctly identifies breaking changes from the demo diff
- [ ] Planner correctly identifies non-breaking changes and exits early
- [ ] Implementer calls `read_frontend_schema` for both files
- [ ] Implementer generates correct updated TypeScript and Zod code
- [ ] Implementer calls `write_frontend_schema` for both files with complete content
- [ ] Critic correctly interprets type-check pass (exit code 0)
- [ ] Critic correctly interprets type-check fail (exit code non-zero)
- [ ] Retry loop feeds stderr back to Implementer and recovers
- [ ] At least 3 consecutive successful end-to-end runs
- [ ] Prompt learnings documented

---

## Phase 5: Demo Recording & Submission (Hours 18–24)

**Goal:** Record a polished 3-minute demo video following `script.md`, create supporting materials, and submit to the hackathon.

**Time Budget:** 6 hours (includes rehearsal, recording, editing, and submission)  
**Dependencies:** All previous phases complete  
**Owner:** Full team

---

### 5.1 Pre-Recording Checklist

Complete ALL of these before starting the actual recording:

| # | Task | How to Verify | Status |
|---|------|---------------|--------|
| 5.1.1 | Reset Repo A to clean `main` branch | `git log --oneline -1` shows initial commit; `user_id` present in `src/server.ts` | ☐ |
| 5.1.2 | Reset Repo B to clean `main` branch | `user_id` present in `src/types.ts` and `src/schemas.ts`; no open PRs | ☐ |
| 5.1.3 | Verify "before" state works | Backend serves `user_id`; frontend displays it correctly | ☐ |
| 5.1.4 | Do a full dry run | Open test PR, watch Action, verify frontend PR created. Then reset everything. | ☐ |
| 5.1.5 | Prepare VS Code layout | Left pane: Repo A `src/server.ts`. Right pane: Repo B `src/types.ts` | ☐ |
| 5.1.6 | Prepare browser tabs | Tab 1: Repo A GitHub. Tab 2: Repo B GitHub. Tab 3: GitHub Actions (Repo A). | ☐ |
| 5.1.7 | Create architecture diagram | Diagram showing: Backend PR → Action → Bob + MCP → Sandbox → Frontend PR | ☐ |
| 5.1.8 | Configure screen recorder | OBS Studio: 1920×1080, 30fps, microphone tested, system audio muted | ☐ |
| 5.1.9 | Write voiceover script notes | Key talking points for each scene on a second screen or printed notes | ☐ |
| 5.1.10 | Time the dry run | Full demo should fit in ~3 minutes with voiceover | ☐ |

### 5.2 Scene-by-Scene Recording Guide

Each scene is mapped directly to `script.md`:

#### Scene 1: The Problem & "Before" State (0:00 – 0:30)

| Aspect | Details |
|--------|---------|
| **Duration** | 30 seconds |
| **Visual** | Split screen: VS Code with Repo A (left) and Repo B (right). Then terminal or browser showing frontend fetching data successfully. |
| **Key Show** | Highlight `user_id` field in backend `server.ts` AND in frontend `types.ts` — they match. Show the frontend displaying "user_id: u-001" in the browser. |
| **Voiceover** | Introduce integration drift problem. Show both repos in sync. |
| **Transitions** | Start on VS Code split → cut to browser/terminal showing working frontend |
| **Fallback** | Pre-record the terminal output and frontend browser view if live demo is unreliable |

#### Scene 2: The Incident (0:30 – 0:50)

| Aspect | Details |
|--------|---------|
| **Duration** | 20 seconds |
| **Visual** | VS Code on Repo A `src/server.ts`. Type the change: `user_id` → `uuid`. Commit. Push. Open PR on GitHub. |
| **Key Show** | The actual code change happening in real-time. The PR being created on GitHub. |
| **Voiceover** | "I'm a backend developer renaming user_id to uuid and opening a PR." |
| **Transitions** | VS Code edit → terminal `git commit` → browser showing new PR on GitHub |
| **Fallback** | Pre-stage the PR if live commit takes too long. Show the PR diff page. |
| **Speed Tip** | Use VS Code find-and-replace (Ctrl+H) for the rename — faster than manual typing on camera. |

#### Scene 3: The Magic — GitHub Actions & Bob (0:50 – 1:50)

| Aspect | Details |
|--------|---------|
| **Duration** | 60 seconds (longest scene — this is the core demo) |
| **Visual** | GitHub Actions tab in Repo A. Click into running workflow. Expand log groups. |
| **Key Show** | (1) MCP server starting, (2) Bob reasoning about the diff, (3) Bob calling MCP tools, (4) type-check passing. Highlight these with mouse cursor or text callouts in post-production. |
| **Voiceover** | Explain MCP Context Bridge, Planner→Implementer→Critic loop, tool calls. |
| **Transitions** | PR page → Actions tab → running workflow → expanded logs |
| **Fallback** | Pre-record the Action logs if timing is tight. Annotate with callout boxes in editing. |
| **Critical Moment** | The log lines showing `read_frontend_schema` and `write_frontend_schema` tool calls — these prove MCP is working. |

#### Scene 4: The Resolution (1:50 – 2:30)

| Aspect | Details |
|--------|---------|
| **Duration** | 40 seconds |
| **Visual** | Switch to Repo B on GitHub. Show the auto-generated PR. Click into the PR diff view. |
| **Key Show** | (1) New PR exists on Repo B, (2) PR title mentions Aegis and the backend PR number, (3) Diff shows `user_id` → `uuid` in `types.ts`, (4) Same change in `schemas.ts`. |
| **Voiceover** | "Aegis automatically opened a PR on the frontend repo with the synced types." |
| **Transitions** | Repo B main page → Pull Requests tab → PR diff view |
| **Fallback** | Screenshot the PR if live generation takes too long |

#### Scene 5: Outro & Future Architecture (2:30 – 3:00)

| Aspect | Details |
|--------|---------|
| **Duration** | 30 seconds |
| **Visual** | Architecture diagram (full screen). Clean, professional diagram. |
| **Key Show** | The full pipeline: Backend PR → GitHub Action → Bob + MCP → Sandbox → Frontend PR. Call out the Docker container future enhancement. |
| **Voiceover** | Docker sandbox future architecture. Thank the team and hackathon. |
| **Transitions** | Fade from GitHub to architecture diagram → fade to black |

### 5.3 Architecture Diagram Specification

Create a clean, professional architecture diagram for Scene 5. Requirements:

- **Style:** Clean boxes and arrows, monochrome or 2-3 accent colors
- **Components shown:** Repo A, GitHub Actions Runner (containing Bob 2.0, MCP Server, Sandbox), Repo B
- **Data flow:** Arrows showing PR → Action → Bob reasoning → MCP tools → type-check → git push → Frontend PR
- **Future enhancement:** Dashed-line Docker container around the Sandbox box
- **Tool:** Use draw.io, Figma, Excalidraw, or similar

```
┌───────────────┐          ┌──────────────────────────────────────────────┐          ┌───────────────┐
│               │          │           GitHub Actions Runner              │          │               │
│   Repo A      │   PR     │                                              │   PR     │   Repo B      │
│   Backend     │─────────►│  ┌──────────┐    ┌───────────────────────┐  │─────────►│   Frontend    │
│               │  opened  │  │ IBM Bob  │    │  MCP Context Bridge   │  │  created │               │
│  Node.js /    │          │  │ 2.0 Shell│◄──►│                       │  │          │  Next.js /    │
│  Express      │          │  │          │    │  • read_frontend_     │  │          │  TypeScript   │
│               │          │  │ ┌──────┐ │    │    schema             │  │          │               │
│  GET /api/    │          │  │ │Plan  │ │    │  • write_frontend_    │  │          │  types.ts     │
│  user         │          │  │ │Impl  │ │    │    schema             │  │          │  schemas.ts   │
│               │          │  │ │Critic│ │    └───────────┬───────────┘  │          │               │
│               │          │  │ └──────┘ │                │              │          │               │
│               │          │  └─────┬────┘                │              │          │               │
│               │          │        │          ┌──────────▼──────────┐   │          │               │
│               │          │        └─────────►│ Sandbox             │   │          │               │
│               │          │                   │ npm run type-check  │   │          │               │
│               │          │                   │ (tsc --noEmit)      │   │          │               │
│               │          │                   │                     │   │          │               │
│               │          │                   │ ┌ ─ ─ ─ ─ ─ ─ ─ ┐ │   │          │               │
│               │          │                   │   Future: Docker     │   │          │               │
│               │          │                   │ │  Container      │ │   │          │               │
│               │          │                   │  ─ ─ ─ ─ ─ ─ ─ ─  │   │          │               │
│               │          │                   └────────────────────┘   │          │               │
└───────────────┘          └──────────────────────────────────────────────┘          └───────────────┘
```

### 5.4 Post-Recording & Submission Tasks

| # | Task | Technical Details | Acceptance Criteria |
|---|------|-------------------|---------------------|
| 5.4.1 | Review raw footage | Watch the entire recording. Note any dead time, errors, or unclear moments. | Recording covers all 5 scenes with no blocking issues |
| 5.4.2 | Edit video | Trim dead time (waiting for Actions to start, page loads). Add text callouts for key moments: "MCP Tool Call", "Breaking Change Detected", "Type-Check Passed". Speed up waiting periods to 2-4x. | Edited video is ≤ 3:00, flows smoothly |
| 5.4.3 | Record/sync voiceover | Record audio narration per script.md. Ensure timing matches visual transitions. | Clear audio, no background noise, matches visuals |
| 5.4.4 | Add intro/outro cards | Simple title card: "Project Aegis — Autonomous Contract Sync" with team name. End card: "Team Aegis Enclave" with GitHub links. | Professional title and end cards |
| 5.4.5 | Export final video | 1080p (1920×1080), H.264 MP4, reasonable file size (< 100MB), 30fps | Plays cleanly in browser and on mobile |
| 5.4.6 | Write project description | For Lablab.ai/Devpost submission: project name, problem statement, solution description, tech stack (IBM Bob 2.0, MCP, GitHub Actions, Node.js, Next.js, TypeScript, Zod), team members, link to GitHub repos, link to demo video. | Compelling, accurate, complete |
| 5.4.7 | Clean up GitHub repos | Ensure both repos are public. README files are complete. No secrets committed. No test branches remaining. | Repos look professional and are navigable |
| 5.4.8 | Submit to hackathon | Upload video. Fill out all submission fields. Link both repos. Submit before deadline. | Submission confirmed — received confirmation email/page |

### Phase 5 Completion Gate

- [ ] Full dry run completed successfully before recording
- [ ] 3-minute demo video recorded covering all 5 scenes per script.md
- [ ] Architecture diagram created and included in video
- [ ] Video edited: trimmed, callouts added, voiceover synced
- [ ] Video exported as 1080p MP4, ≤ 3:00 duration
- [ ] Project description written for submission platform
- [ ] Both GitHub repos are public, clean, and well-documented
- [ ] Submission completed on Lablab.ai/Devpost before deadline
- [ ] Confirmation of submission received

---

## Cross-Phase: Risk Mitigation & Rollback Strategy

### Risk Matrix

| # | Risk | Phase | Likelihood | Impact | Mitigation Strategy |
|---|------|-------|-----------|--------|---------------------|
| R1 | IBM Bob 2.0 SDK/Shell installation fails in CI environment | 3 | Medium | **Critical** | Pre-test on a local Docker image matching `ubuntu-latest`. Prepare a fallback script that calls the Bob API directly via `curl`. Have a local execution option ready. |
| R2 | MCP server fails to start or connect in Actions runner | 3 | Medium | **High** | Health-check with 30s timeout. Fallback: embed read/write operations as direct shell commands (`cat`, `tee`) instead of MCP tools. |
| R3 | Bob Shell generates invalid TypeScript code | 4 | Medium | **Medium** | Critic retry loop (3 attempts). Explicit prompt rules about complete file generation. Fallback: hardcode the expected `types.ts` and `schemas.ts` output for the demo. |
| R4 | PAT authentication fails for cross-repo operations | 3 | Low | **Critical** | Test clone + push manually before the hackathon. Use a classic PAT (broader permissions) as backup. Verify token hasn't expired. |
| R5 | GitHub Actions queue delays cause slow execution | 3, 5 | Medium | **Low** | Consider a self-hosted runner as backup. Pre-record the Actions logs for the demo video. |
| R6 | Bob hallucinates extra fields or removes existing ones | 4 | Medium | **Medium** | Explicit negative rules in prompt ("NEVER invent fields"). Critic type-check catches most errors. Prompt iteration in Phase 4. |
| R7 | MCP SDK API differs from documentation | 2 | Low | **High** | Review actual SDK examples, not just docs. Have a minimal working MCP server example as reference. Fallback: use raw JSON-RPC over stdio. |
| R8 | Demo recording captures a failure | 5 | Low | **Medium** | Do a full dry run before recording. Have pre-recorded fallback footage for each scene. Edit out any issues in post-production. |
| R9 | Zod schema and TypeScript interface get out of sync | 4 | Low | **Medium** | The type-check catches this. The prompt explicitly states "update BOTH files". The Critic phase validates consistency. |
| R10 | Network timeout during GitHub API calls | 3 | Low | **Low** | Retry logic on `gh pr create`. GitHub Actions has built-in retry for checkout/clone actions. |

### Rollback Strategy — Per Phase

Each phase has an independent completion gate. If a phase blocks, here are the degradation paths:

| Phase | Failure Scenario | Rollback / Degradation |
|-------|-----------------|------------------------|
| **Phase 1** | Repos won't scaffold correctly | Minimal impact — start over. Use `create-next-app` defaults. Simplify the User schema if needed. |
| **Phase 2** | MCP server too complex to build in time | **Degrade:** Skip Express wrapper. Use Bob's native filesystem tools with `REPO_B_PATH` as the allowed root. Or use a simple bash script wrapper that reads/writes files and register it as an MCP tool. |
| **Phase 3** | GitHub Actions integration fails | **Degrade:** Run Bob Shell locally instead of in CI. Capture terminal output as the demo. Still demonstrates the core concept (Bob + MCP + type-checking). |
| **Phase 4** | Prompts produce inconsistent results | **Degrade:** Simplify to a single-step prompt (no multi-agent decomposition). Hard-code the expected output for the demo scenario. The architecture still works — the prompt just needs more iteration time. |
| **Phase 5** | Live demo fails during recording | **Degrade:** Use pre-recorded footage and screen captures. Walk through the code and architecture as a narrated code tour. Still a valid submission. |

### Emergency Fallback: Minimum Viable Demo

If everything goes wrong, the absolute minimum viable demo is:

1. Show the two repos with matching types (static screenshots)
2. Show the backend code change (VS Code recording)
3. Show Bob Shell running locally with MCP tools (terminal recording)
4. Show the resulting type changes (VS Code diff view)
5. Narrate the architecture over a diagram

This can be assembled in ~2 hours even without working CI/CD integration.

---

## Appendix: Complete File Manifest

Every file to be created across all phases, with its purpose and the phase it's created in:

```
project-aegis/
├── PRD.md                                         ← [EXISTS] Product requirements
├── script.md                                      ← [EXISTS] Demo video script
├── IMPLEMENTATION_PLAN.md                         ← [THIS FILE] Technical implementation plan
│
├── docs/
│   └── architecture.png                           ← [Phase 5] Architecture diagram for demo
│
├── repo-a-backend/                                ← [Phase 1] Backend mock API repository
│   ├── src/
│   │   └── server.ts                              ← [Phase 1] Express API with GET /api/user
│   ├── package.json                               ← [Phase 1] Project manifest
│   ├── tsconfig.json                              ← [Phase 1] TypeScript configuration
│   ├── .gitignore                                 ← [Phase 1] Git ignore rules
│   ├── README.md                                  ← [Phase 1] Project documentation
│   ├── .github/
│   │   └── workflows/
│   │       └── aegis.yml                          ← [Phase 3] GitHub Actions workflow
│   ├── mcp-config.json                            ← [Phase 3] Bob Shell MCP configuration
│   └── prompts/
│       ├── aegis-master-prompt.md                 ← [Phase 4] Master orchestrator prompt
│       └── NOTES.md                               ← [Phase 4] Prompt engineering notes
│
├── repo-b-frontend/                               ← [Phase 1] Frontend application repository
│   ├── src/
│   │   ├── types.ts                               ← [Phase 1] TypeScript interfaces
│   │   ├── schemas.ts                             ← [Phase 1] Zod validation schemas
│   │   ├── app/
│   │   │   ├── layout.tsx                         ← [Phase 1] Next.js root layout
│   │   │   └── page.tsx                           ← [Phase 1] Main page component
│   │   └── lib/
│   │       └── api.ts                             ← [Phase 1] Fetch utility
│   ├── package.json                               ← [Phase 1] Project manifest (incl. type-check)
│   ├── tsconfig.json                              ← [Phase 1] TypeScript configuration
│   ├── .gitignore                                 ← [Phase 1] Git ignore rules
│   ├── next.config.js                             ← [Phase 1] Next.js configuration
│   └── README.md                                  ← [Phase 1] Project documentation
│
└── mcp-server/                                    ← [Phase 2] MCP Context Bridge server
    ├── src/
    │   ├── index.ts                               ← [Phase 2] Server entry point & tool registration
    │   ├── config.ts                              ← [Phase 2] Environment config & constants
    │   ├── validation.ts                          ← [Phase 2] Path security & input validation
    │   └── tools/
    │       ├── readFrontendSchema.ts               ← [Phase 2] read_frontend_schema handler
    │       └── writeFrontendSchema.ts              ← [Phase 2] write_frontend_schema handler
    ├── tests/
    │   ├── readFrontendSchema.test.ts              ← [Phase 2] Unit tests for read tool
    │   ├── writeFrontendSchema.test.ts             ← [Phase 2] Unit tests for write tool
    │   └── validation.test.ts                      ← [Phase 2] Unit tests for path security
    ├── package.json                               ← [Phase 2] Project manifest
    ├── tsconfig.json                              ← [Phase 2] TypeScript configuration
    └── README.md                                  ← [Phase 2] Setup & usage docs
```

**Total files to create:** ~30 files across 3 sub-projects  
**Total estimated lines of code:** ~800–1200 LOC (excluding generated/scaffold files)
