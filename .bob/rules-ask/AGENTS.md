# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Documentation Context (Non-Obvious)

- **`mcp-server/` is in the same repo as `repo-a-backend/`** (not a separate repo). The MCP server is packaged with the backend so the GitHub Actions runner can build and start it in the same workspace.
- **`repo-b-frontend/` is a standalone repo** in production (separate GitHub repo: `Aegis-Enclave/repo-b-frontend`). In CI, it's cloned to `./repo-b` inside the runner. The `repo-b-frontend/` directory in this monorepo is the local dev copy.
- **The demo's entire breaking-change scenario is `user_id` → `uuid`** (one field rename in `repo-a-backend/src/server.ts`). All tests and prompts assume this pattern.
- **`repo-a-backend/prompts/`** directory should contain the IBM Bob master prompt (`aegis-master-prompt.md`) referenced by the CI workflow's `envsubst` call — this is consumed by the headless Bob agent loop.
- **`mcp-config.json`** at `repo-a-backend/mcp-config.json` is the MCP server configuration used by both local Bob sessions and the CI runner. It points to the built `mcp-server/dist/index.js`.
