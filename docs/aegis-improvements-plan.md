# Project Aegis — Improvements Plan

## Overview

This plan addresses all improvement areas identified across the Aegis monorepo: the CI/CD
pipeline (`aegis.yml`), the MCP server, the agent prompt, the frontend API client, and the
backend mock API. Improvements are grouped into self-contained sub-tasks ordered from most
critical (broken runtime behaviour) to least critical (observability and quality-of-life).

Each sub-task can be executed independently. The plan is structured so that a single agent
session handles one sub-task, validates it, then stops for review.

---

## Sub-Task 1 — Fix CI Workflow Permissions & `sed` Shell Injection

**Status:** [x] done

### Intent
Two bugs in `aegis.yml` will prevent the workflow from running correctly in production.
The `pull-requests: write` permission is present at line 19, so the PR comment step
is actually fine — but the `sed` injection on line 118 is not. When the backend diff
contains `/`, `\`, `&`, or newlines, `sed "s|...|${BACKEND_DIFF}|g"` silently produces
a mangled or empty prompt.

### Expected Outcomes
- Diff injection uses a shell-safe substitution method (`python3 -c`) identical to the
  one already used in the curl branch (line 124), so all special characters survive
- The `SKIP_AEGIS` guard on the Bob CLI path is consistent with the API fallback path
- Existing workflow logic is otherwise unchanged

### Todo List
1. In the `bob shell --headless` branch of the `Execute Aegis Agent Loop` step, replace
   the `envsubst` call with a `python3 -c` substitution that reads the prompt file,
   replaces the `${BACKEND_DIFF}` placeholder using Python string replacement, and writes
   the result to `/tmp/aegis-prompt.md`
2. Pass `--prompt "$(cat /tmp/aegis-prompt.md)"` to the `bob shell` call
3. Do the same for the second `bob --headless` fallback call on line 137

### Relevant Context
- File: `repo-a-backend/.github/workflows/aegis.yml`, lines 113–141
- The API-fallback branch (lines 123–126) already uses `python3 -c 'import sys,json; ...'`
  as a model for the correct approach
- `BACKEND_DIFF` is exported as an env var on line 114; Python's `os.environ` can read it

---

## Sub-Task 2 — Atomic Writes in MCP Write Tool

**Status:** [x] done

### Intent
`writeFrontendSchema` calls `fs.writeFile` directly. If the process crashes or the disk
is full mid-write, the target file (`types.ts` or `schemas.ts`) ends up in a partially
written, corrupted state with no way to recover. The fix is a write-then-rename pattern:
write to a `.tmp` sibling file, then `fs.rename` — which is atomic on POSIX filesystems
(Linux/macOS and the GitHub Actions `ubuntu-latest` runner).

### Expected Outcomes
- A crash or disk-full condition during write leaves the original file untouched
- On success the file is replaced atomically
- Existing tests continue to pass (they observe the final file on disk, not the tmp file)
- A new test verifies the tmp file does not persist after a successful write

### Todo List
1. In `writeFrontendSchema.ts`, change the write logic to:
   - Derive a tmp path: same directory as `absolutePath`, filename `.<basename>.tmp`
   - Write content to the tmp path
   - `fs.rename(tmpPath, absolutePath)` to atomically replace the target
   - Wrap the cleanup in a `finally` block that removes the tmp file if `rename` throws
2. Add a test case to `tests/writeFrontendSchema.test.ts` that confirms no `.tmp` file
   remains after a successful write

### Relevant Context
- File: `mcp-server/src/tools/writeFrontendSchema.ts`, line 41
- `fs/promises` already imported; `path` needs to be imported for `dirname`/`basename`
- `rename` from `fs/promises` is the correct API
- Tests use a real temp directory (`tmpDir`), so atomic rename will work in the test env

---

## Sub-Task 3 — Symlink Resolution in MCP Validation

**Status:** [x] done

### Intent
`validateAndResolvePath` uses `path.resolve()` (synchronous, pure string resolution) to
check that the file is inside `REPO_B_PATH`. It does not dereference symlinks. If
`src/types.ts` inside the cloned repo is a symlink pointing outside the boundary,
the string check passes but the actual read/write targets a different file. The fix is to
call `fs.realpath` after the string check and re-verify the boundary on the real path.

### Expected Outcomes
- If either the target file or any ancestor directory is a symlink that resolves outside
  `REPO_B_PATH`, a `PATH_TRAVERSAL` error is thrown
- Non-symlink paths behave identically to today
- A new test in `tests/validation.test.ts` creates a symlink and confirms the error is thrown
- No change to the allowlist logic or the McpToolError codes

### Todo List
1. Change `validateAndResolvePath` to be `async` (or create a new `asyncValidateAndResolvePath`)
2. After the string-based boundary check, call `fs.realpath(resolvedPath)` and check that
   the result still starts with `resolvedBase + path.sep`
3. Throw `McpToolError('PATH_TRAVERSAL', ...)` if the real path escapes the boundary
4. Update both `readFrontendSchema.ts` and `writeFrontendSchema.ts` callers to `await`
   the now-async validator
5. Add a test in `tests/validation.test.ts` that creates a symlink from `src/types.ts`
   inside the tmp dir to `/tmp` and asserts the `PATH_TRAVERSAL` error is thrown

### Relevant Context
- File: `mcp-server/src/validation.ts`, function `validateAndResolvePath`
- `fs/promises` is available but not currently imported in `validation.ts`
- Both tool files (`readFrontendSchema.ts`, `writeFrontendSchema.ts`) call this synchronously;
  they are already `async`, so awaiting is straightforward
- `fs.realpath` throws `ENOENT` if the file doesn't exist yet (write case). Catch `ENOENT`
  and fall back to the string-resolved path for that specific case (file doesn't exist yet,
  which is legitimate for a first write)

---

## Sub-Task 4 — File Size Limits on MCP Read and Write

**Status:** [x] done

### Intent
Neither MCP tool imposes any size cap. A malformed or adversarially large file could read
gigabytes into memory (read tool) or fill the runner disk (write tool). A 512 KB cap is
appropriate for pure TypeScript type files — far beyond any realistic schema file while
providing a clear safety ceiling.

### Expected Outcomes
- `readFrontendSchema` throws `McpToolError('FILE_NOT_FOUND', ...)` → actually a new code:
  add `FILE_TOO_LARGE` to the `McpToolError` code union in `validation.ts`
- `readFrontendSchema` checks file size via `fs.stat` before reading; throws if `> 512 KB`
- `writeFrontendSchema` checks `content.length` before writing; throws if `> 512 KB`
- New tests cover both over-limit cases

### Todo List
1. Add `'FILE_TOO_LARGE'` to the `code` union in `McpToolError` in `validation.ts`
2. In `readFrontendSchema.ts`, after path validation call `fs.stat(absolutePath)` and
   throw `McpToolError('FILE_TOO_LARGE', ...)` if `stat.size > 524288` (512 × 1024)
3. In `writeFrontendSchema.ts`, after the empty-content check, throw `McpToolError('FILE_TOO_LARGE', ...)`
   if `Buffer.byteLength(input.content, 'utf-8') > 524288`
4. Add one test per tool confirming the error is thrown for oversized input

### Relevant Context
- File: `mcp-server/src/validation.ts` — add code to union
- Files: `mcp-server/src/tools/readFrontendSchema.ts` and `writeFrontendSchema.ts`
- `fs/promises` is already imported in the read tool; stat can be added inline
- 512 KB constant should be defined in `config.ts` as `MAX_FILE_SIZE_BYTES` so it's
  configurable in one place

---

## Sub-Task 5 — Error Feedback Loop: Inject Type-Check Errors into Agent Retry

**Status:** [x] done

### Intent
When `tsc --noEmit` fails, the error output is saved to `/tmp/type-check-output.txt` and
posted on the PR — but it is never fed back to the Bob agent. If the agent retries, it
re-reads the files via MCP but has no context about which lines or fields caused the
failure. Providing this output closes the self-correction loop that is the whole point of
the system.

The approach is a **single integrated loop**: the agent step, type-check, and optional
re-run are merged into one shell script that iterates up to N times. Each iteration runs
Bob, then immediately type-checks the result. If type-check fails, the errors are written
into an augmented prompt file and Bob is invoked again — all within the same step. This
avoids the complexity of cross-step state passing and keeps the loop logic in one place.

### Expected Outcomes
- The `Execute Aegis Agent Loop` step and `Final Type-Check Validation` step are replaced
  by a single `Aegis Sync Loop` step that contains a `for` loop (max 3 iterations)
- Each iteration:
  1. Runs Bob with the current prompt file
  2. Runs `docker build` + `docker run tsc --noEmit` inline
  3. If type-check passes: sets `AEGIS_RESULT=SYNC_COMPLETE`, breaks the loop
  4. If type-check fails: appends the tsc error output to the prompt file under a
     `## Type-Check Errors` section and continues to the next iteration
- After the loop, if `AEGIS_RESULT` is not `SYNC_COMPLETE` and changes were detected,
  the step exits non-zero so the failure comment and PR-skip logic triggers correctly
- The prompt template gains a `## Type-Check Errors` section (initially empty) with
  instructions: if this section is populated, fix only the listed errors before
  rewriting files

### Todo List
1. In `aegis-master-prompt.md`, add a `## Type-Check Errors` section at the end (below
   the diff block) with placeholder `${TSC_ERRORS}` and instructions telling the agent
   to treat a non-empty section as the authoritative list of things to fix on retry
2. In `aegis.yml`, replace the separate `Execute Aegis Agent Loop` and
   `Final Type-Check Validation` steps with a single `Aegis Sync Loop` step containing
   a bash `for i in 1 2 3` loop
3. Within each loop iteration:
   a. Use the python3 substitution to write the current prompt (with `BACKEND_DIFF` and
      `TSC_ERRORS`) to `/tmp/aegis-prompt-iter-$i.md`
   b. Run Bob with `--prompt "$(cat /tmp/aegis-prompt-iter-$i.md)"` and capture output
   c. Run `docker build --no-cache -t "${IMAGE_TAG}" $REPO_B_PATH`
   d. Run `docker run --rm "${IMAGE_TAG}" 2>&1 | tee /tmp/type-check-output.txt`; capture exit code
   e. If exit code is 0: `echo "AEGIS_RESULT=SYNC_COMPLETE" >> $GITHUB_ENV; break`
   f. If exit code is non-zero: read `/tmp/type-check-output.txt` into `TSC_ERRORS`
      shell variable; continue to next iteration
4. After the loop: if `AEGIS_RESULT` is still unset, set it to `FAILED` and `exit 1`
5. Remove the now-redundant standalone `Final Type-Check Validation` step from the workflow
6. Update the `Post Failure Comment` step's condition — it already uses `failure()`, which
   will still trigger correctly when the loop step exits 1

### Relevant Context
- File: `repo-a-backend/.github/workflows/aegis.yml`, lines 108–163
- File: `repo-a-backend/prompts/aegis-master-prompt.md`, lines 83–93
- `docker build` in each iteration is expensive; this is acceptable because the loop will
  typically break on iteration 1 (type-check passes) — iterations 2–3 are only for
  genuinely incorrect agent output
- The docker image tag should include the iteration number to avoid cache confusion:
  `aegis-type-check:${{ github.sha }}-iter-$i`
- Cleanup (Sub-Task 8) must remove all three potential image tags

---

## Sub-Task 6 — Fetch Timeout and CORS in Frontend

**Status:** [x] done

### Intent
`fetchWithRetry` in `api.ts` has no per-request timeout. If the backend accepts the TCP
connection but never sends a response, every retry attempt hangs indefinitely. Additionally,
`server.ts` has no CORS headers — any browser request from port 3000 to port 3001 is
blocked by the browser's same-origin policy. Both are correctness issues.

### Expected Outcomes
- Each `fetch` call in `fetchWithRetry` uses an `AbortController` with a configurable
  timeout (default: 10 000 ms). If the timeout fires, the request is aborted and the error
  is treated as a retryable network failure
- `server.ts` uses the `cors` npm package with `CORS_ORIGIN` env var support
- Existing retry logic is unchanged

### Todo List
1. In `repo-b-frontend/src/lib/api.ts`, add an optional `timeoutMs` parameter to
   `fetchWithRetry` (default `10_000`)
2. Inside the `for` loop, create `const controller = new AbortController()` and
   `const timer = setTimeout(() => controller.abort(), timeoutMs)` before `fetch`
3. Pass `{ signal: controller.signal }` to `fetch`, and `clearTimeout(timer)` in a
   `finally` block after the fetch resolves or rejects
4. Treat `AbortError` as a retryable network error (same path as connection refused) —
   check `err instanceof Error && err.name === 'AbortError'`
5. In `repo-a-backend/src/server.ts`, run `npm install cors @types/cors` then add
   `import cors from 'cors'` and `app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }))`
   before the route definition

### Relevant Context
- File: `repo-b-frontend/src/lib/api.ts`, lines 29–43 (the fetch call)
- File: `repo-a-backend/src/server.ts`, lines 1–5 (imports and setup)
- `AbortController` is available in Node 18+ and all modern browsers; no polyfill needed

---

## Sub-Task 7 — Add `UserSchema.strict()` and Fix Email Mismatch

**Status:** [x] done

### Intent
`UserSchema` in `schemas.ts` uses Zod's default "strip" mode — extra fields from the
backend are silently discarded. This hides forward-incompatible responses. Using `.strict()`
makes the schema throw if the backend sends unexpected extra fields, surfacing contract
drift immediately. Additionally, the `.email()` validator is stricter than what the backend
actually validates; the plan is to preserve it but document the intentional mismatch in a
comment so the agent never silently removes it.

### Expected Outcomes
- `UserSchema` is defined with `.strict()` so unknown backend fields cause a runtime
  `ZodError` (caught by the existing try/catch in the caller)
- A comment above the `.email()` line documents that backend does not enforce email format,
  but frontend does for defence-in-depth
- `tsc --noEmit` still passes after the change

### Todo List
1. Change `z.object({...})` to `z.object({...}).strict()` in `repo-b-frontend/src/schemas.ts`
2. Add a comment above `email: z.string().email()` noting the intentional validation gap
3. Run `npm run type-check` in `repo-b-frontend` to confirm no compile errors

### Relevant Context
- File: `repo-b-frontend/src/schemas.ts`, line 9
- Zod `.strict()` is a method on `ZodObject`; it does not change the inferred type
- The existing `UserFromSchema` export is unaffected

---

## Sub-Task 8 — Branch Collision Fix and Idempotent PR Creation

**Status:** [x] done

### Intent
Branch names use second-precision timestamps: `aegis/sync-pr<N>-<YYYYMMDDHHmmSS>`. Two
simultaneous Aegis runs can produce the same branch name. Also, if a workflow run is
retried, `gh pr create` will fail because the PR already exists, and this failure is not
caught. Both issues are fixed with `${{ github.run_id }}` in the branch name and a
`--fill` or existence-check before `gh pr create`.

### Expected Outcomes
- Branch name includes `github.run_id` which is unique per workflow run, eliminating
  collisions
- Before `gh pr create`, check if a PR for the branch already exists; if so, print a
  message and skip creation rather than failing
- Docker image created in Stage 5 is removed in the Cleanup stage

### Todo List
1. In the `Push Changes & Create Frontend PR` step, replace the `date +%Y%m%d%H%M%S` suffix
   with `${{ github.run_id }}` so the branch name is `aegis/sync-pr<N>-<run_id>`
2. Before `gh pr create`, add:
   `EXISTING=$(gh pr list --repo "${{ env.FRONTEND_REPO }}" --head "${BRANCH}" --json number --jq '.[0].number' 2>/dev/null)`
   and `if [ -n "$EXISTING" ]; then echo "PR #$EXISTING already exists — skipping"; exit 0; fi`
3. In the `Cleanup` step, remove all iterated image tags generated by Sub-Task 5's loop:
   `for i in 1 2 3; do docker rmi "aegis-type-check:${{ github.sha }}-iter-$i" 2>/dev/null || true; done`

### Relevant Context
- File: `repo-a-backend/.github/workflows/aegis.yml`, lines 219 and 239–267
- `gh pr list --head <branch>` returns an empty array if no PR exists; the `jq` expression
  returns empty string, so the `-n` check is clean
- `github.run_id` is a numeric string unique per workflow execution

---

## Sub-Task 9 — Frontend Unit + Integration Tests for `api.ts`

**Status:** [x] done

### Intent
`fetchWithRetry` and `fetchUser` have zero test coverage. Two layers of tests are needed:
unit tests for the retry/timeout/error-handling logic in isolation, and integration tests
that spin up the real Express backend and make real HTTP calls through the full `fetchUser`
stack including Zod validation.

### Expected Outcomes

**Unit tests** (`src/lib/__tests__/api.unit.test.ts`):
- Successful fetch returns a validated `User`
- 5xx response is retried up to 3 times then throws
- 4xx response throws immediately without retry
- Network error (connection refused simulation) retries then throws
- Schema validation failure (`ZodError`) throws and is not retried
- `AbortError` (timeout) is treated as a retryable network failure (after Sub-Task 6)
- Exponential backoff delays are correct (uses `jest.useFakeTimers()`)

**Integration tests** (`src/lib/__tests__/api.integration.test.ts`):
- Spins up the real Express backend from `repo-a-backend/src/server.ts` on a random
  free port in `beforeAll`
- `fetchUser()` called against the live server returns a fully-typed, Zod-validated `User`
- When the server is closed mid-test, retries fire and eventually throw
- When the server returns a schema-violating response (injected via a test route), `fetchUser`
  throws `ZodError`

Tests run via `npm test` in `repo-b-frontend`. All tests pass; `npm run type-check` still passes.

### Todo List
1. Install test dependencies in `repo-b-frontend`:
   `npm install -D jest ts-jest @types/jest jest-environment-node`
2. Add a `jest.config.ts` to `repo-b-frontend` with `testEnvironment: 'node'`, ts-jest
   transform, and separate test match globs for `*.unit.test.ts` and `*.integration.test.ts`
3. Add `"test": "jest"` to `repo-b-frontend/package.json` scripts
4. Export `fetchWithRetry` from `api.ts` so unit tests can call it directly, and add an
   optional `fetchFn` parameter (defaults to `globalThis.fetch`) to allow injection of a
   mock fetch without patching globals
5. Create `src/lib/__tests__/api.unit.test.ts` with all unit test cases above, using the
   injected `fetchFn` for mocking and `jest.useFakeTimers()` for backoff delay assertions
6. In `repo-a-backend/src/server.ts`, separate the `app` export from the `listen` call:
   export `app` at module level and wrap `app.listen(...)` in
   `if (require.main === module) { ... }` so tests can import the app without starting it
7. Create `src/lib/__tests__/api.integration.test.ts` that:
   a. In `beforeAll`, imports `app` from `repo-a-backend/src/server.ts` and calls
      `app.listen(0)` to bind a random port; reads back `server.address().port`
   b. Sets `process.env.NEXT_PUBLIC_BACKEND_URL` to `http://localhost:<port>`
   c. In `afterAll`, calls `server.close()` to tear down
   d. Tests `fetchUser()` end-to-end against the live server
   e. Temporarily monkey-patches the route on the live `app` to return a type-violating
      response and asserts `ZodError` is thrown
8. Configure `jest.config.ts` with a `moduleNameMapper` entry to resolve the
   cross-package import of `repo-a-backend/src/server.ts` from `repo-b-frontend`
   (map `../../../../repo-a-backend/(.*)` to `<rootDir>/../repo-a-backend/$1`)

### Relevant Context
- File: `repo-b-frontend/src/lib/api.ts` — `fetchWithRetry` needs to be exported and
  accept an injected fetch function
- File: `repo-a-backend/src/server.ts` — `app` must be a named export; `listen` must
  be conditional on `require.main === module`
- The integration test crosses the monorepo package boundary; ts-jest's `moduleNameMapper`
  handles this without a separate tsconfig
- `NEXT_PUBLIC_BACKEND_URL` must be set before `api.ts` is imported in the integration
  test; use `jest.resetModules()` and dynamic `import()` inside `beforeAll` to ensure
  the env var is read at import time

---

## Sub-Task 10 — GitHub Actions Job Summary (Observability)

**Status:** [x] done

### Intent
There is currently no structured record of what Aegis did on a given run. GitHub Actions
natively supports a job summary via `$GITHUB_STEP_SUMMARY` — a markdown file rendered in
the workflow run UI. A final summary step can write a table showing: backend PR number,
diff line count, files changed, type-check result, and frontend PR URL (if created). This
is zero-cost and requires no external observability infrastructure.

### Expected Outcomes
- A new `Write Job Summary` step (runs `if: always()`) appends a markdown table to
  `$GITHUB_STEP_SUMMARY` including: run id, trigger PR, diff size, Aegis result
  (skipped / sync complete / failed), and frontend PR link if available
- The summary is visible in the Actions tab for every run regardless of outcome

### Todo List
1. Add a step `Write Job Summary` near the end of the workflow, `if: always()`
2. Use `echo "..." >> $GITHUB_STEP_SUMMARY` to write a markdown table with the fields above
3. Export a `FRONTEND_PR_URL` env var in the `Push Changes & Create Frontend PR` step
   (capture the output of `gh pr create`) for use in the summary
4. Export a `AEGIS_RESULT` env var at the end of the agent step
   (`SYNC_COMPLETE`, `NO_BREAKING_CHANGES`, or `FAILED`) for use in the summary

### Relevant Context
- File: `repo-a-backend/.github/workflows/aegis.yml`, Stage 7 (Cleanup, lines 273–278)
- `gh pr create` outputs the PR URL to stdout; capture with `FRONTEND_PR_URL=$(gh pr create ...)`
- `$GITHUB_STEP_SUMMARY` is a file path; append with `>>`; GitHub renders it as markdown

---

## Implementation Order

The sub-tasks are ordered so that infrastructure correctness (1–4) is fixed before
higher-level features (5–10). Sub-tasks 1–4 are independent of each other and can be
implemented in any order. Sub-tasks 6 and 7 are independent of all others. Sub-task 9
depends on Sub-task 6 (to test the timeout). Sub-task 10 depends on Sub-task 8 (to
capture `FRONTEND_PR_URL`).

```
Sub-Task 1 (sed injection)       ─┐
Sub-Task 2 (atomic writes)        ├─ fix correctness bugs first
Sub-Task 3 (symlink check)        │
Sub-Task 4 (size limits)         ─┘
Sub-Task 5 (error feedback)       ── closes the agent retry loop
Sub-Task 6 (timeout + CORS)      ─┐
Sub-Task 7 (strict schema)        ├─ independent improvements
Sub-Task 8 (branch + idempotency) │
Sub-Task 10 (observability)      ─┘
Sub-Task 9 (frontend tests)       ── depends on Sub-Task 6
```
