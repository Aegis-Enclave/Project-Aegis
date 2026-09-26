# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Coding Rules (Non-Obvious)

- **Never use a top-level constant for `REPO_B_PATH`** — always call `getRepoBBasePath()` (function) so `process.env.REPO_B_PATH` overrides work in tests.
- **MCP tool errors must use `McpToolError`** from `mcp-server/src/validation.ts`, not `Error`. The MCP index catches `instanceof McpToolError` to return structured `isError: true` responses; uncaught errors crash the server.
- **`mcp-server` internal imports use `.js` extension** (e.g., `import { x } from './validation.js'`) even for `.ts` source files — required by Node16 module resolution.
- **`write_frontend_schema` must reject empty/whitespace-only content** — check `content.trim().length === 0` before writing; this is enforced in tests.
- **Tests use real filesystem (no fs mocks)** — create tmp dirs with `fs.mkdtempSync`, set `process.env.REPO_B_PATH = tmpDir` in `beforeAll`, clean up in `afterAll`. Do not mock `fs/promises`.
- **`mcp-server` build script does `tsc && chmod 755 dist/index.js`** — if you only run `tsc`, the binary won't be executable. Always use `npm run build`.
- **`repo-b-frontend` has no test suite** — the only validation command is `npm run type-check` (`tsc --noEmit`). The Critic agent depends on this returning a non-zero exit code to detect failures.
- **`repo-a-backend` uses CommonJS (`"module": "commonjs"`)** while `mcp-server` uses Node16 ESM-compatible output. Do not mix import styles between packages.
