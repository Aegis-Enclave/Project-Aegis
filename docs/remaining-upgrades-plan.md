# Project Aegis — Remaining Upgrades Plan

## Overview

Phases 1 and 2 of the upgrade path are complete:
- ✅ **Phase 1** — Containerized validation sandbox (Docker build/run in Stage 5 of `aegis.yml`)
- ✅ **Phase 2** — Frontend vulnerability patch (Next.js `14.0.4` → `14.2.35`)

This plan covers the two remaining phases:
- **Phase 3** — Frontend API resilience (exponential backoff retry in `fetchUser`)
- **Phase 4** — Enhanced PR feedback loop (post type-check errors as GitHub PR comments)

Both phases are independent and can be implemented in any order, but Phase 3 is simpler and is listed first.

---

## Sub-Task 1 — Frontend API Resilience (Exponential Backoff)

### Intent
The current `fetchUser()` in `repo-b-frontend/src/lib/api.ts` makes a single `fetch` call. If the backend is temporarily unreachable (cold start, rolling deploy, transient network hiccup), the call fails immediately and the frontend crashes or displays an error. Adding exponential backoff gives the backend time to recover before surfacing an error to the user.

### Design Decisions
- **3 retries maximum** (matching the agent's own max-attempts convention established in the prompt).
- **Exponential delays:** 500ms → 1000ms → 2000ms (base 500ms, doubled each attempt).
- **Retry only on network/5xx errors** — a `4xx` response is a caller error and should not be retried.
- **No external library** — the retry logic here is simple enough to implement cleanly in ~20 lines without pulling in `cockatiel` or similar. The file is currently 26 lines; the retry wrapper will keep it well under 80 lines.
- **Preserves the Zod validation call** — the retry only wraps the `fetch` + response status check, not the schema parse. A schema parse failure is not a transient error.
- **Clear final error message** — if all retries are exhausted, throw an `Error` that names the number of attempts so the UI can display it.

### Expected Outcomes
- `fetchUser()` retries up to 3 times on network failures or 5xx responses before throwing.
- On success on any attempt, the resolved `User` is returned identically to today.
- On total failure, an `Error` is thrown with a message that indicates all retries were exhausted.
- `tsc --noEmit` (the Docker type-check) continues to pass — no TypeScript contract changes.
- The existing call site in `repo-b-frontend/src/app/page.tsx` requires no changes.

### Todo List
1. Open `repo-b-frontend/src/lib/api.ts` and read the current implementation.
2. Implement a `fetchWithRetry` private helper above `fetchUser`:
   - Accept `(url: string, maxRetries: number, baseDelayMs: number)` — returns `Promise<Response>`.
   - On each attempt, call `fetch(url)`.
   - If the response is OK (`response.ok`), return it.
   - If `response.status >= 500` and retries remain, `await` the backoff delay and try again.
   - If `response.status >= 400` and `< 500`, throw immediately (no retry).
   - After exhausting retries, throw `Error` with a clear message.
   - Catch network-level errors (fetch throws) and retry them the same way as 5xx.
3. Replace the bare `fetch(...)` call in `fetchUser` with `fetchWithRetry(url, 3, 500)`.
4. Run `npm run type-check` from `repo-b-frontend` to confirm zero type errors.

### Relevant Context
- **File to change:** [`repo-b-frontend/src/lib/api.ts`](repo-b-frontend/src/lib/api.ts)
- **Call site (read-only):** `repo-b-frontend/src/app/page.tsx` — calls `fetchUser()`, no change needed.
- **Type oracle:** Docker container running `tsc --noEmit` (same image as Stage 5 in `aegis.yml`).
- **Project rule:** `repo-b-frontend` has no test suite — the only validation oracle is `tsc --noEmit`.

### Status
[x] done

---

## Sub-Task 2 — Enhanced PR Feedback Loop (PR Comment on Failure)

### Intent
When the Aegis agent fails to resolve frontend types (the Docker type-check exits non-zero after all agent iterations), the workflow currently just fails. The error output is buried in the Actions logs. Developers need to click into the workflow run to see why synchronization failed.

This sub-task adds a new step in `aegis.yml` that captures the final type-check output and posts it as a markdown comment directly on the backend PR, tagging the PR author, so the developer is notified immediately without needing to navigate to the Actions tab.

### Design Decisions
- **Capture output, not just exit code:** The Docker run command's stdout/stderr are already merged via `2>&1` in Stage 5. The step needs to save that output to a file for the comment step to reference.
- **`gh pr comment`** is already available in the ubuntu-latest runner and the workflow already uses `gh pr create` in Stage 6, so no new tooling is needed.
- **Conditional execution:** The comment step must run only when Stage 5 fails (using `if: failure()`). It must also respect `SKIP_AEGIS != 'true'`.
- **PR author tagging:** Use `${{ github.event.pull_request.user.login }}` to mention the author.
- **Permissions:** The `gh pr comment` call on Repo A's own PR needs `pull-requests: write` permission on the job. The current job only has `pull-requests: read` — this must be upgraded.
- **Exit code preservation:** Stage 5's `docker run` exit code must propagate as workflow failure. A separate capture step must not swallow the failure. The cleanest pattern is: run Docker, tee output to a file, then let the step fail naturally. A subsequent step with `if: failure()` reads the file and posts the comment.
- **Comment format:** Markdown code block with the `tsc` error output for readability, plus context about which backend PR triggered the failure.

### Expected Outcomes
- When Stage 5 (type-check) fails, a new GitHub PR comment appears on the backend PR within the same workflow run.
- The comment includes: a header identifying it as an Aegis failure, the raw `tsc` error output in a code fence, the backend PR number, and a `@mention` of the PR author.
- When Stage 5 passes, no comment is posted.
- When `SKIP_AEGIS=true`, the comment step does not run.
- The workflow continues to fail (exit non-zero) even after the comment is posted — the comment is a notification, not a recovery.

### Todo List
1. Open `repo-a-backend/.github/workflows/aegis.yml`.
2. Upgrade the job-level `permissions` block:
   - Add `pull-requests: write` (needed for `gh pr comment`).
3. Modify the **"✅ Final Type-Check Validation"** step (Stage 5):
   - Pipe the Docker output to both stdout and a temp file using `tee`:
     ```
     docker run --rm "${IMAGE_TAG}" 2>&1 | tee /tmp/type-check-output.txt
     ```
   - Ensure the step still fails on non-zero exit code. Because `pipe` in bash swallows the left-side exit code, use `set -o pipefail` at the top of the `run` block, or check `${PIPESTATUS[0]}` explicitly.
4. Add a new step **after** Stage 5 titled **"💬 Post Failure Comment on PR"**:
   - Gate with: `if: failure() && env.SKIP_AEGIS != 'true'`
   - Read `/tmp/type-check-output.txt`
   - Use `gh pr comment` to post a formatted markdown comment on the PR:
     ```
     gh pr comment ${{ github.event.pull_request.number }} --body "..."
     ```
   - The comment body must use the A+B format: a structured markdown header (PR number, `@mention` of the author, brief Aegis context) followed by the raw `tsc` output in a fenced code block.
   - Example structure:
     ```
     ## 🛡️ Aegis: Type-Check Failed on PR #<number>
     @<author> — the automated frontend sync could not be validated.

     **Backend PR:** #<number>
     **Triggered by:** Changes in `src/server.ts`

     ### TypeScript Errors
     ```
     <raw tsc output>
     ```
     ```
   - Set `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` in the step's `env` block (this is the built-in token, sufficient for commenting on the same repo's PR).
5. Verify the new step is placed **before** Stage 6 (PR creation) in the file so the comment precedes any branch push activity.
6. Review the full workflow file to confirm all conditional guards (`if:`) are consistent.

### Relevant Context
- **File to change:** [`repo-a-backend/.github/workflows/aegis.yml`](repo-a-backend/.github/workflows/aegis.yml)
- **Current permissions block (line 17–20):** `contents: read`, `pull-requests: read` — must add `pull-requests: write`.
- **Stage 5 (line 154–162):** `docker run --rm "${IMAGE_TAG}" 2>&1` — needs `tee` and `pipefail`.
- **`gh` CLI:** Pre-installed on `ubuntu-latest`; already used in Stage 6 for `gh pr create`.
- **`GITHUB_TOKEN`:** Built-in secret; no new secrets needed for commenting on the triggering repo's PR.
- **AGENTS.md constraint:** `SKIP_AEGIS` env var short-circuits everything; the new step must also respect it.

### Status
[x] done

---

## Implementation Notes

- **Order:** Either sub-task can be implemented first; they touch different files.
- **Validation for Sub-Task 1:** `cd repo-b-frontend && npm run type-check` (or build the Docker image locally and run it).
- **Validation for Sub-Task 2:** Manual review of the YAML diff; the `gh pr comment` path can only be fully tested in a real GitHub Actions run, but the YAML can be linted with `actionlint` if available.
- **No new secrets required:** Sub-Task 2 uses the built-in `GITHUB_TOKEN` for PR comments on the triggering repo.
