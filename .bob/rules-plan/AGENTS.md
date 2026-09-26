# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Architecture Constraints (Non-Obvious)

- **MCP server is stateless and transport-bound to stdio.** It does not maintain server-side session state; each Bob invocation spawns a new process. Do not add in-memory caches or module-level mutable state.
- **Security layer is double-gated:** allowlist check first (rejects anything not literally `src/types.ts` or `src/schemas.ts`), then path-traversal boundary check second. Both gates must remain — removing the boundary check would leave a TOCTOU-style gap even though allowlist items can't traverse today.
- **CI pipeline clones Repo B with `--depth 1`** — no git history available in `./repo-b` during CI. Do not design anything that requires `git log` or `git diff` on the Repo B clone.
- **`SKIP_AEGIS` env var short-circuits the entire Bob/MCP pipeline** in the workflow if `src/server.ts` has no diff. Any new CI steps that depend on MCP output must check `env.SKIP_AEGIS != 'true'`.
- **Bob is invoked via two fallback paths:** (1) `bob shell --headless` CLI, (2) `curl` to `https://api.ibm.com/bob/v2/agent/run`. The prompt template uses `envsubst` to inject `$BACKEND_DIFF`. The prompt file lives at `repo-a-backend/prompts/aegis-master-prompt.md`.
- **`types.ts` and `schemas.ts` must never be merged into a single file.** The MCP tool allowlist and agent prompt engineering both assume exactly two separate, single-concern files as targets.
- **`repo-b-frontend` has no test suite by design** — the validation oracle is `tsc --noEmit` only. Adding Jest/Vitest would require changing the Critic agent prompt and CI validation step.
