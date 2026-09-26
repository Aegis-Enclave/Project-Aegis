# Containerized Validation Sandbox — Implementation Plan

## Overview

**Goal:** Move the frontend type-check validation step in the Aegis CI pipeline from a bare `npm run type-check` command on the shared GitHub Actions runner into an isolated Docker container. This prevents environment pollution, ensures consistent Node/TypeScript versions, and reduces the attack surface of the CI runner hosting the MCP server.

**Key Decisions:**
- Docker image is tagged with `aegis-type-check:${{ github.sha }}` to avoid stale cache collisions across concurrent runs on the same runner.
- `docker build` is called with `--no-cache` to guarantee a clean `npm ci` on every run. Correctness is the priority: the Bob agent writes files between Stage 4 and Stage 5, so any stale layer would undermine the validation. The dependency set is slim enough that the speed cost is negligible.

**Scope:**
- Add `Dockerfile` and `.dockerignore` to `repo-b-frontend/`
- Update the `Final Type-Check Validation` step in `repo-a-backend/.github/workflows/aegis.yml` to build and run the Docker container
- Pipe container stdout/stderr back to the runner log (and make it available to the actor-critic loop)

**Non-Goals:**
- Changes to the MCP server or Bob agent invocation
- Changing how `npm ci` is run for dependency installation during earlier stages
- Any Next.js upgrade work (that is a separate upgrade item)

---

## Sub-Tasks

---

### Sub-Task 1 — Create `repo-b-frontend/Dockerfile`

**Intent:** Define a minimal, reproducible Docker image that installs the frontend's dependencies and runs `tsc --noEmit` inside an isolated container. The image must reflect the same Node 20 / TypeScript 5 environment used natively today.

**Expected Outcomes:**
- `repo-b-frontend/Dockerfile` exists and can be built with `docker build .` from that directory
- The built image, when run, executes `npm run type-check` and exits with code 0 on a valid codebase, or non-zero if type errors are present
- The image is lean: no Next.js dev server, no runtime process — just the type-check invocation

**Todo List:**
1. Create `repo-b-frontend/Dockerfile` using `node:20-alpine` as the base image
2. Set `WORKDIR /app`
3. `COPY package*.json ./` then `RUN npm ci --ignore-scripts` (install deps without running lifecycle scripts)
4. `COPY . .` to bring in all source files including `tsconfig.json`, `next.config.js`, and `src/`
5. Set the default `CMD` to `["npm", "run", "type-check"]`
6. Confirm the image does NOT use `EXPOSE` or `ENTRYPOINT` intended for a running server

**Relevant Context:**
- [`repo-b-frontend/package.json`](repo-b-frontend/package.json) — `type-check` script is `tsc --noEmit`
- [`repo-b-frontend/tsconfig.json`](repo-b-frontend/tsconfig.json) — uses `moduleResolution: "bundler"` and `plugins: [{name: "next"}]`; the Next.js TypeScript plugin resolves at install time via `node_modules`, which is why `npm ci` must run inside the image
- Node version parity: workflow uses `node:20` via `actions/setup-node@v4`

**Status:** `[x] done`

---

### Sub-Task 2 — Create `repo-b-frontend/.dockerignore`

**Intent:** Prevent large or irrelevant directories from being copied into the Docker build context, keeping build times fast and the image clean.

**Expected Outcomes:**
- `.dockerignore` exists in `repo-b-frontend/`
- `node_modules/`, `.next/`, and `tsconfig.tsbuildinfo` are excluded from the build context
- `.git/` and any local environment files are excluded

**Todo List:**
1. Create `repo-b-frontend/.dockerignore`
2. Add entries: `node_modules`, `.next`, `tsconfig.tsbuildinfo`, `.git`, `*.env`, `*.env.*`

**Relevant Context:**
- [`repo-b-frontend/`](repo-b-frontend/) top-level listing — `node_modules/`, `tsconfig.tsbuildinfo` are present and must be excluded
- The `Dockerfile` runs `npm ci` inside the image, so a host `node_modules` would be stale and harmful if copied

**Status:** `[x] done`

---

### Sub-Task 3 — Update `aegis.yml` — Stage 5: Replace native type-check with Docker run

**Intent:** Modify the `Final Type-Check Validation` step to build the Docker image from the cloned `repo-b` directory, then run it. Pipe stdout and stderr from the container back to the Actions log. The exit code of `docker run` must propagate directly — non-zero exits must still fail the step.

**Expected Outcomes:**
- Stage 5 no longer calls `npm run type-check` directly on the runner
- `docker build` is called against `${{ env.REPO_B_PATH }}`
- `docker run --rm` is called; container output is captured and printed to the Actions log
- The step exits with the container's exit code (preserving the CI fail/pass behavior)
- The `working-directory` setting on the step is removed or changed to the workspace root, since Docker is invoked at the runner level

**Todo List:**
1. Open `repo-a-backend/.github/workflows/aegis.yml`
2. Locate the `Final Type-Check Validation` step (lines 154–160)
3. Remove the `working-directory: ${{ env.REPO_B_PATH }}` line from this step
4. Replace the `run` block with:
   ```yaml
   run: |
     IMAGE_TAG="aegis-type-check:${{ github.sha }}"
     echo "Building validation sandbox image (tag: ${IMAGE_TAG})..."
     docker build --no-cache -t "${IMAGE_TAG}" ${{ env.REPO_B_PATH }}
     echo "Running type-check inside container..."
     docker run --rm "${IMAGE_TAG}" 2>&1
     echo "✅ Type-check passed — changes are valid"
   ```
5. Verify the step still carries `if: env.SKIP_AEGIS != 'true'` — do not remove this guard

**Relevant Context:**
- [`repo-a-backend/.github/workflows/aegis.yml`](repo-a-backend/.github/workflows/aegis.yml:154) — target step is at lines 154–160
- Docker is pre-installed on `ubuntu-latest` GitHub-hosted runners — no additional install step needed
- `2>&1` ensures stderr from `tsc` is included in the Actions log and available to any downstream step that reads the log

**Status:** `[x] done`

---

### Sub-Task 4 — Verify the actor-critic loop can consume container output

**Intent:** The Bob agent prompt and CI design assumes the stdout/stderr of the type-check is visible in the runner log. With Docker, the output is piped via `2>&1` so it appears inline in the step log — the same place it appeared before. Confirm no changes to the agent prompt or MCP tools are required.

**Expected Outcomes:**
- The agent prompt at `repo-a-backend/prompts/aegis-master-prompt.md` does not need to change
- The MCP server configuration is unaffected (it reads/writes files, not CI logs)
- Any existing pattern where the agent re-reads type-check output from the Actions log continues to work because the container output is surfaced at the same log level

**Todo List:**
1. Read `repo-a-backend/prompts/aegis-master-prompt.md` and confirm it does not reference a specific command name (`npm run type-check`) that must be updated
2. Read `repo-a-backend/mcp-config.json` and confirm no tool references the native `npm run type-check` call
3. If the prompt or config references the raw command string, update it to reflect "container-based validation"
4. No changes needed → mark complete and note rationale

**Relevant Context:**
- [`repo-a-backend/prompts/aegis-master-prompt.md`](repo-a-backend/prompts/aegis-master-prompt.md) — agent instructions; check for hardcoded command references
- [`repo-a-backend/mcp-config.json`](repo-a-backend/mcp-config.json) — MCP tool registry for Bob

**Status:** `[x] done`

---

## File Change Summary

| File | Change Type | Notes |
|------|-------------|-------|
| `repo-b-frontend/Dockerfile` | **New** | Alpine Node 20, runs `npm run type-check` |
| `repo-b-frontend/.dockerignore` | **New** | Excludes `node_modules`, `.next`, build artifacts |
| `repo-a-backend/.github/workflows/aegis.yml` | **Modified** | Stage 5 step uses `docker build` + `docker run` |
| `repo-a-backend/prompts/aegis-master-prompt.md` | **Possibly modified** | Only if command string is hardcoded — sub-task 4 decides |

---

## Key Constraints (from AGENTS.md)

- `types.ts` and `schemas.ts` must remain as separate files — this plan does not touch them
- `SKIP_AEGIS` guard on Stage 5 must be preserved
- CI clones Repo B with `--depth 1` — the Docker image is built from the cloned copy at `$REPO_B_PATH`, which is fine since `npm ci` runs inside the container
- No changes to the MCP server or its stdio transport
