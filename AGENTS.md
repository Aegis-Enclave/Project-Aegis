# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

Project Aegis is a monorepo containing three packages: `repo-a-backend` (Express API), `repo-b-frontend` (Next.js), and `mcp-server` (MCP Context Bridge). The purpose is an autonomous CI/CD agent that detects breaking backend API changes and auto-syncs frontend TypeScript types via IBM Bob 2.0.

## Repository Structure (Critical)

```
project-aegis/
├── repo-a-backend/     # Express mock API — runs on port 3001
├── repo-b-frontend/    # Next.js app — runs on port 3000; uses NEXT_PUBLIC_BACKEND_URL
├── mcp-server/         # MCP stdio server — NO shared node_modules, each pkg is independent
└── repo-a-backend/.github/workflows/aegis.yml  # CI pipeline that drives the whole system
```

**All commands must be run from their respective sub-directory.** There is no root-level `package.json` or workspace manager.

## Commands (run from each sub-directory)

| Package | Command | Notes |
|---------|---------|-------|
| `repo-a-backend` | `npm run dev` | ts-node (commonjs) |
| `repo-b-frontend` | `npm run type-check` | **Critical** — this is what the Critic agent runs to validate synced types |
| `mcp-server` | `npm test` | Jest with ts-jest; uses real filesystem via tmp dirs |
| `mcp-server` | `npm run build && chmod 755 dist/index.js` | build script does both; `dist/index.js` must be executable |

### Run a single test (mcp-server)
```bash
cd mcp-server && npx jest tests/validation.test.ts
```

## Architecture — Key Non-Obvious Facts

- **`mcp-server` uses ESM (`"type": "module"`) but Jest is configured with ts-jest in CommonJS mode** (see `package.json` jest config — `useESM: false`, `"module": "CommonJS"`). Internal imports use `.js` extensions (e.g., `'../validation.js'`), required by Node16 module resolution in `tsconfig.json`.
- **`REPO_B_PATH` env var controls where MCP tools read/write.** Tests set it to a `tmp` directory in `beforeAll`. In CI, it's set to `./repo-b` (cloned inside the runner). Locally it defaults to `./repo-b` relative to CWD of the process.
- **`getRepoBBasePath()` in `config.ts` is a function, not a constant**, so tests can override `process.env.REPO_B_PATH` at runtime and the config picks it up per-call.
- **MCP server transport is stdio only** (`StdioServerTransport`). It does not expose an HTTP port. The `mcp-config.json` at `repo-a-backend/mcp-config.json` points to the compiled `dist/index.js`.
- **`write_frontend_schema` is a FULL OVERWRITE** — no diffing. When calling via MCP, always provide the complete file content.
- **CI only triggers on changes to `src/server.ts`** (path filter in `aegis.yml`). Bob is run headlessly via `bob shell --headless` or an API fallback using `curl` to `https://api.ibm.com/bob/v2/agent/run`.

## Code Style

- **TypeScript strict mode** across all three packages.
- **Error handling:** Use `McpToolError` (from `mcp-server/src/validation.ts`) for MCP-layer errors; catch `err as NodeJS.ErrnoException` for Node fs errors. Throw `McpToolError` with a typed `code` field (`FILE_NOT_ALLOWED` | `PATH_TRAVERSAL` | `FILE_NOT_FOUND` | `WRITE_FAILED`).
- **`types.ts` and `schemas.ts` are intentionally separate files** in `repo-b-frontend/src/`. The MCP tools target each file independently. `UserSchema` in `schemas.ts` and `User` interface in `types.ts` must stay structurally identical.
- **Frontend imports:** `import type { User }` from `types.ts`; value imports from `schemas.ts`. `api.ts` uses `validated as User` cast after `UserSchema.parse()`.

## MCP Tool Allowlist

Only two files are accessible via MCP tools: `src/types.ts` and `src/schemas.ts` (relative to `REPO_B_PATH`). Any other path returns `FILE_NOT_ALLOWED`. The allowlist is in `mcp-server/src/config.ts`.
