# Project Aegis — Scalability Implementation Plan

## Overview

This plan implements all 14 scalability improvements described in
`docs/scalability-axes.md`. They are grouped into four axes matching the doc, then
ordered within each axis so each sub-task is independently reviewable. Every
sub-task is scoped to the minimum files necessary — no task touches more than two
files, and most touch only one.

**Primary files in play:**
- `repo-a-backend/.github/workflows/aegis.yml`
- `repo-a-backend/prompts/aegis-master-prompt.md`
- `mcp-server/src/config.ts`
- `repo-a-backend/aegis-consumers.yml` *(new file, Axis 1.2)*

---

## Axis 1 — One-to-Many Repo Relationships

---

### Sub-task 1.1 — Fan-out sync (matrix strategy)

**Status:** [x] done

**Intent**
Convert the single-target workflow into a matrix job so one backend PR triggers
parallel sync PRs across multiple frontend consumers simultaneously.

**Expected Outcomes**
- `FRONTEND_REPO` env var is replaced by a `matrix.consumer` list.
- The clone step, Bob invocation, and `gh pr create` step all reference
  `matrix.consumer.repo` and `matrix.consumer.path`.
- Each matrix leg produces its own independent frontend PR.

**Todo List**
1. In `aegis.yml`, replace the top-level `env.FRONTEND_REPO` and `env.REPO_B_PATH`
   with a `strategy.matrix` block listing each consumer as `{ repo, path }`.
2. Update the clone step to use `${{ matrix.consumer.repo }}` and
   `${{ matrix.consumer.path }}`.
3. Update every step that references `env.FRONTEND_REPO` or `env.REPO_B_PATH` to
   use the matrix values.
4. Add `fail-fast: false` so one failing consumer leg does not cancel others.

**Relevant Context**
- `aegis.yml` line 28–30: current `REPO_B_PATH` and `FRONTEND_REPO` env vars.
- `aegis.yml` line 43–51: clone step.
- `mcp-server/src/config.ts` `getRepoBBasePath()` already reads `REPO_B_PATH`
  from the environment at call-time — no MCP changes required.

---

### Sub-task 1.2 — Dependency graph chaining (repository_dispatch)

**Status:** [x] done

**Intent**
Allow Aegis to propagate changes through a chain of backend-to-backend
dependencies by emitting a `repository_dispatch` event after each successful
sync, which fires the downstream repo's own `aegis.yml`.

**Expected Outcomes**
- A new file `repo-a-backend/aegis-consumers.yml` declares downstream consumers.
- `aegis.yml` has a new step after the frontend PR creation that reads
  `aegis-consumers.yml` and emits one `repository_dispatch` per declared
  downstream backend repo using the GitHub API.
- The dispatch event carries the original backend PR number as payload.

**Todo List**
1. Create `repo-a-backend/aegis-consumers.yml` with a `downstream_backends` list
   (initially empty; consumers add their repo slug to enable chaining).
2. Add a new `aegis.yml` step after the "Push Changes & Create Frontend PR" step
   that reads `aegis-consumers.yml` with `yq` (available on ubuntu-latest), loops
   over `downstream_backends`, and calls the GitHub API `repository_dispatch`
   endpoint for each entry using `secrets.FRONTEND_REPO_PAT`.
3. Guard the step with `if: env.SKIP_AEGIS != 'true' && env.AEGIS_RESULT == 'SYNC_COMPLETE'`.

**Relevant Context**
- `aegis.yml` line 231: "🚀 Push Changes & Create Frontend PR" step — new step
  goes immediately after this.
- No Bob or MCP changes required.

---

### Sub-task 1.3 — Monorepo support

**Status:** [x] done

**Intent**
Allow Aegis to run inside a monorepo where no cross-repo clone is needed — just
point `REPO_B_PATH` at a workspace-relative path and skip the clone.

**Expected Outcomes**
- The clone step is conditioned on a new input `monorepo: false` (workflow
  `workflow_dispatch` input or env var).
- `ALLOWED_FILES` in `config.ts` accepts either the default `src/types.ts` paths
  or, when `MONOREPO_FRONTEND_PREFIX` is set, prefixed paths like
  `packages/frontend/src/types.ts`.

**Todo List**
1. In `aegis.yml`, add a `workflow_dispatch` trigger with a boolean input
   `monorepo` (default `false`) and derive a `MONOREPO` env var from it.
2. Gate the "Clone Repo B" step with `if: env.MONOREPO != 'true'`.
3. In `mcp-server/src/config.ts`, read an optional `MONOREPO_FRONTEND_PREFIX`
   env var. If set, prepend it to each entry in `ALLOWED_FILES` at runtime.
   Keep the default behaviour unchanged when the var is absent.

**Relevant Context**
- `aegis.yml` line 42–51: clone step to be gated.
- `mcp-server/src/config.ts` line 19–22: `ALLOWED_FILES` constant — change to a
  computed value via a `getAllowedFiles()` function.

---

## Axis 2 — One File Type → Many Contract Formats

---

### Sub-task 2.1 — OpenAPI spec generation

**Status:** [x] done

**Intent**
Teach Aegis to derive an `openapi.yaml` from the backend diff and commit it
alongside the type changes in the frontend repo.

**Expected Outcomes**
- `src/openapi.yaml` is added to `ALLOWED_FILES`.
- The prompt has a new write step after Step 4 that instructs Bob to generate and
  write a minimal OpenAPI 3.1 YAML file for the `User` endpoint.

**Todo List**
1. In `mcp-server/src/config.ts`, add `'src/openapi.yaml'` to `ALLOWED_FILES`
   (or to `getAllowedFiles()` if sub-task 1.3 was implemented first).
2. In `aegis-master-prompt.md`, extend the "Available MCP Tools" section to show
   `src/openapi.yaml` as a valid `filePath`.
3. Add a new **Step 4b: GENERATE_OPENAPI** block in the prompt between Step 4 and
   Step 5, instructing Bob to write a minimal OpenAPI document reflecting the
   detected contract changes.

**Relevant Context**
- `mcp-server/src/config.ts` line 19: `ALLOWED_FILES`.
- `aegis-master-prompt.md` line 73–76: Step 4 WRITE block.

---

### Sub-task 2.2 — Multi-language client generation

**Status:** [x] done

**Intent**
Extend Aegis to generate Python Pydantic models (and/or Go structs, Rust serde
structs) alongside the TypeScript output.

**Expected Outcomes**
- `src/models.py` (Pydantic), `src/models.go`, and/or `src/models.rs` are added
  to `ALLOWED_FILES`.
- The prompt includes a specialist generation step per language, clearly
  separated from the TypeScript steps.

**Todo List**
1. Add target file paths to `ALLOWED_FILES` in `config.ts` for each desired
   language (start with `src/models.py`).
2. Add a **Step 4c: GENERATE_PYTHON** section to the prompt with Pydantic-specific
   generation rules (BaseModel, type mapping, field aliases).
3. Add `src/models.py` to the PR body "Files Updated" list in `aegis.yml`.

**Relevant Context**
- `mcp-server/src/config.ts` line 19: `ALLOWED_FILES`.
- `aegis-master-prompt.md` line 64–71: format-preservation rules (same discipline
  applies to new language files).
- `aegis.yml` line 291–294: "Files Updated" list in the PR body.

---

### Sub-task 2.3 — GraphQL schema sync

**Status:** [x] done

**Intent**
When the backend exposes a GraphQL layer, keep the frontend `.graphql` schema
file in sync with contract changes.

**Expected Outcomes**
- `src/schema.graphql` is added to `ALLOWED_FILES`.
- The prompt has a **Step 4d: GENERATE_GRAPHQL** block.

**Todo List**
1. Add `'src/schema.graphql'` to `ALLOWED_FILES` in `config.ts`.
2. Add a **Step 4d: GENERATE_GRAPHQL** block to the prompt with SDL syntax rules
   and field-mapping conventions.
3. Document in the step that this step is skipped (by Bob) if no GraphQL-related
   file is present in the frontend repo.

**Relevant Context**
- `mcp-server/src/config.ts` line 19: `ALLOWED_FILES`.
- `aegis-master-prompt.md` line 73: Step 4 WRITE block.

---

### Sub-task 2.4 — SDK auto-publish

**Status:** [x] done

**Intent**
After Aegis creates the frontend PR, automatically trigger an npm publish of the
versioned client SDK from the synced frontend repo.

**Expected Outcomes**
- A new `aegis.yml` step after "Push Changes & Create Frontend PR" runs
  `npm version patch && npm publish` from `$REPO_B_PATH`.
- The step is gated on `AEGIS_RESULT == 'SYNC_COMPLETE'` and requires an
  `NPM_TOKEN` secret.

**Todo List**
1. Add a "📦 Publish SDK" step after the PR creation step in `aegis.yml`.
2. The step runs `npm version patch --no-git-tag-version` then `npm publish
   --access public` from the cloned frontend directory.
3. Pass `NPM_TOKEN` from secrets as `NODE_AUTH_TOKEN`.
4. Gate with `if: env.SKIP_AEGIS != 'true' && env.AEGIS_RESULT == 'SYNC_COMPLETE'`.

**Relevant Context**
- `aegis.yml` line 231–311: "Push Changes & Create Frontend PR" step.
- No MCP involvement.

---

### Sub-task 2.5 — JSON Schema generation

**Status:** [x] done

**Intent**
Produce a `contract.schema.json` for runtime validation outside TypeScript.

**Expected Outcomes**
- `src/contract.schema.json` is added to `ALLOWED_FILES`.
- The prompt has a **Step 4e: GENERATE_JSON_SCHEMA** block.

**Todo List**
1. Add `'src/contract.schema.json'` to `ALLOWED_FILES` in `config.ts`.
2. Add a **Step 4e: GENERATE_JSON_SCHEMA** block to the prompt with JSON Schema
   draft-07 rules and field-type mapping conventions from TypeScript.

**Relevant Context**
- `mcp-server/src/config.ts` line 19: `ALLOWED_FILES`.
- `aegis-master-prompt.md` line 73: Step 4 WRITE block.

---

## Axis 3 — Smarter Agent Behavior

---

### Sub-task 3.1 — Consuming code sync

**Status:** [x] done

**Intent**
Extend Bob's write scope to also update call-site references in `page.tsx` and
`api.ts` when a field is renamed or removed.

**Expected Outcomes**
- `src/app/page.tsx` and `src/lib/api.ts` are added to `ALLOWED_FILES`.
- The prompt has a new **Step 4f: UPDATE_CALLSITES** block after Step 4 that
  instructs Bob to read and patch all hardcoded field references in those files.

**Todo List**
1. Add `'src/app/page.tsx'` and `'src/lib/api.ts'` to `ALLOWED_FILES` in
   `config.ts`.
2. In `aegis-master-prompt.md`, add a **Step 4f: UPDATE_CALLSITES** block:
   read both files, identify any usages of changed field names, apply the rename.
3. Add those files to the PR body "Files Updated" list in `aegis.yml`.

**Relevant Context**
- `mcp-server/src/config.ts` line 19: `ALLOWED_FILES`.
- `aegis-master-prompt.md` line 73: Step 4 WRITE block.
- `aegis.yml` line 291–294: "Files Updated" list in the PR body.

---

### Sub-task 3.2 — Deprecation-first strategy

**Status:** [x] done

**Intent**
On rename changes, add the new field alongside the old one (marked
`/** @deprecated */`) rather than doing an immediate hard rename, to give
consumers a grace period.

**Expected Outcomes**
- Step 3 generation rules in the prompt are extended with a two-phase rule:
  "If the change is a rename, add the new field AND mark the old field
  `/** @deprecated */` — do NOT remove it."
- The removal PR is documented as requiring a separate Bob invocation on a
  timer-based workflow (out of scope for this sub-task — just document it).

**Todo List**
1. In `aegis-master-prompt.md` Step 3 (lines 63–71), add a conditional rule:
   detect rename changes specifically and emit the deprecated + new field pair.
2. Add a corresponding Zod rule: keep the old schema field with `.optional()`
   plus a comment, add the new field.
3. Add a note in the Step 3 block directing Bob to label the PR with
   "deprecation" when this path is taken.

**Relevant Context**
- `aegis-master-prompt.md` lines 63–71: Step 3 GENERATE rules — only this
  section changes.

---

### Sub-task 3.3 — Semantic change classification

**Status:** [x] done

**Intent**
Give Bob a third outcome for additive-only changes — `ADDITIVE_CHANGE` — so it
writes files but labels the PR differently and omits the "breaking change"
warning.

**Expected Outcomes**
- Step 1 in the prompt has three possible outcomes: `NO_BREAKING_CHANGES`,
  `ADDITIVE_CHANGE`, and `BREAKING_CHANGE`.
- The `ADDITIVE_CHANGE` path: Bob writes the new field without the breaking-change
  warning; PR title gets a "✨ Additive" label.
- `aegis.yml` PR creation step conditionally changes the PR title prefix based on
  a new `CHANGE_CLASS` env var Bob outputs.

**Todo List**
1. In `aegis-master-prompt.md` Step 1 (lines 36–47), add a third outcome:
   ```
   RESULT: ADDITIVE_CHANGE
   CHANGE_CLASS: ADDITIVE
   ```
   triggered when only new optional fields are added (no renames, removals, or
   type narrowing).
2. In `aegis-master-prompt.md` Step 5, add a `CHANGE_CLASS:` token to the
   `RESULT: SYNC_COMPLETE` block.
3. In `aegis.yml` PR creation step, parse `CHANGE_CLASS` from
   `/tmp/bob-output.json` and conditionally prefix the PR title with
   `✨ Additive:` vs `⚠️ Breaking:`.

**Relevant Context**
- `aegis-master-prompt.md` lines 36–47: Step 1 outcomes.
- `aegis-master-prompt.md` lines 83–89: Step 5 RESULT block.
- `aegis.yml` lines 278–306: `gh pr create` call.

---

### Sub-task 3.4 — Confidence scoring

**Status:** [x] done

**Intent**
Bob reports a `CONFIDENCE: HIGH | MEDIUM | LOW` token in its output. Low-
confidence runs add a reviewer request and a "needs-human-review" label to the
frontend PR instead of flagging it as ready to merge.

**Expected Outcomes**
- The `RESULT: SYNC_COMPLETE` block in the prompt includes a `CONFIDENCE:` token.
- `aegis.yml` PR creation step parses that token and conditionally appends
  `--reviewer` and `--label needs-human-review` for LOW or MEDIUM confidence.

**Todo List**
1. In `aegis-master-prompt.md` Step 5 (lines 83–89), extend the `RESULT:
   SYNC_COMPLETE` block with `CONFIDENCE: HIGH | MEDIUM | LOW` and decision
   criteria (e.g. LOW when the diff is ambiguous or partial).
2. In `aegis.yml`, after the Bob invocation, parse the confidence token from
   `/tmp/bob-output.json` and export it as `CONFIDENCE` env var.
3. In the `gh pr create` command, conditionally append `--label needs-human-review`
   when `CONFIDENCE != 'HIGH'`.

**Relevant Context**
- `aegis-master-prompt.md` lines 83–89: Step 5 success block.
- `aegis.yml` lines 278–306: `gh pr create` call.

---

### Sub-task 3.5 — Self-healing retry with structured error context

**Status:** [x] done

**Intent**
The type-check error output is already saved to `/tmp/type-check-output.txt`
but is never fed back to Bob. Wire it directly into the retry prompt so Bob
has the exact `tsc` diagnostics on each retry attempt.

**Expected Outcomes**
- The `TSC_ERRORS` variable in the sync loop is populated from
  `/tmp/type-check-output.txt` on every failed iteration.
- The existing `${TSC_ERRORS}` placeholder in the prompt is already there —
  this is purely a `aegis.yml` wiring change.

**Note:** The prompt already has the `${TSC_ERRORS}` section (lines 120–128 of
`aegis-master-prompt.md`) and `aegis.yml` lines 177–178 already set
`TSC_ERRORS` — the current loop IS wired. This sub-task is to verify the
wiring is correct and add a structured header to the fed-back context so
Bob knows which iteration it is and what file failed.

**Todo List**
1. In `aegis.yml` sync loop (line 178), extend the `TSC_ERRORS` export to
   include a structured prefix: `"=== Iteration ${ITER} tsc errors ===\n"`.
2. Verify that the Python substitution at line 133–134 correctly passes
   `TSC_ERRORS` through. Confirm `os.environ.get('TSC_ERRORS', '')` picks up
   the exported shell variable (it does via the `env:` block at line 188).
3. Add an `export TSC_ERRORS` at line 121 so later iterations in the same
   shell always see the updated value.

**Relevant Context**
- `aegis.yml` lines 119–180: the sync loop.
- `aegis-master-prompt.md` lines 120–128: `${TSC_ERRORS}` section.

---

## Axis 4 — Observability & Operational Maturity

---

### Sub-task 4.1 — Structured run logs (GITHUB_STEP_SUMMARY)

**Status:** [x] done

**Intent**
The existing "📋 Write Job Summary" step (line 316) emits a markdown table.
Extend it to also write a machine-readable JSON summary for downstream
tooling — same step, appended after the markdown block.

**Expected Outcomes**
- The `GITHUB_STEP_SUMMARY` output includes a fenced JSON block at the bottom
  containing: `run_id`, `backend_pr`, `diff_lines`, `aegis_result`, `retry_count`,
  `frontend_pr_url`, Bob output summary.

**Todo List**
1. In `aegis.yml` "📋 Write Job Summary" step (line 316), track iteration count
   in a new `ITER_COUNT` env var (set at the end of each loop iteration).
2. After the existing markdown table output in the summary step, append a
   ```` ```json ```` block assembled from existing variables:
   `github.run_id`, `DIFF_LINES`, `AEGIS_RESULT`, `ITER_COUNT`, `FRONTEND_PR_URL`.

**Relevant Context**
- `aegis.yml` lines 316–342: existing "📋 Write Job Summary" step.
- `ITER_COUNT` needs to be exported from inside the sync loop.

---

### Sub-task 4.2 — Failure notifications (Slack/Teams webhook)

**Status:** [x] done

**Intent**
Post a webhook notification when the agent exhausts retries, using the already-
correct `if: failure()` pattern in the existing failure step.

**Expected Outcomes**
- The "💬 Post Failure Comment on PR" step gains a `curl` call to
  `secrets.SLACK_WEBHOOK_URL` (or `TEAMS_WEBHOOK_URL`) with a structured JSON
  payload describing the failure.
- When the secret is absent, the `curl` call silently no-ops (guarded by
  `if: secrets.SLACK_WEBHOOK_URL != ''`).

**Todo List**
1. In `aegis.yml` "💬 Post Failure Comment on PR" step (line 192), append a
   `curl` call inside the existing `run:` block that posts to
   `${{ secrets.SLACK_WEBHOOK_URL }}`.
2. JSON payload: `{ "text": "Aegis failed on PR #N — tsc errors in job #R" }`.
3. Wrap in `if [ -n "${SLACK_WEBHOOK_URL}" ]; then ... fi` so runs without the
   secret are unaffected.
4. Add `SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}` to the step `env:`.

**Relevant Context**
- `aegis.yml` lines 192–217: "💬 Post Failure Comment on PR" step.

---

### Sub-task 4.3 — Contract changelog

**Status:** [x] done

**Intent**
Auto-append a changelog entry to `$REPO_B_PATH/CHANGELOG.md` before the commit
so every sync is historically recorded with the date, backend PR link, and a
list of changed fields.

**Expected Outcomes**
- A new step before the `git add -A` commit (line 251) appends a markdown
  changelog block to `$REPO_B_PATH/CHANGELOG.md`.
- The `git add -A` on line 251 already stages all changes, so the changelog
  is automatically included in the commit with no extra steps.

**Todo List**
1. Add a "📝 Append Contract Changelog" step before "🚀 Push Changes & Create
   Frontend PR" in `aegis.yml`.
2. The step appends to `${{ env.REPO_B_PATH }}/CHANGELOG.md`:
   ```
   ## [YYYY-MM-DD] Backend PR #N
   ...field change bullets from $CHANGES_SUMMARY if available, else generic...
   ```
3. Use `date -u +%Y-%m-%d` for the date stamp.

**Relevant Context**
- `aegis.yml` line 250–251: `git add -A` — the changelog append must come before
  this, i.e. in a preceding step or earlier in the same step's script.
- The "🔍 Show Changes Made" step (line 219) is a good insertion point — add a
  new step after it.

---

### Sub-task 4.4 — Metrics emission

**Status:** [x] done

**Intent**
Capture timing data (workflow start vs completion) and result codes in the
job summary, enabling trend tracking via GitHub's built-in job summary retention.

**Expected Outcomes**
- Job start time is captured at the beginning of the workflow (step 1 or as a
  dedicated step).
- The "📋 Write Job Summary" step includes a "Duration" row in the existing
  markdown table.

**Todo List**
1. Add a step near the top of `aegis.yml` (after checkout) that exports
   `AEGIS_START_TIME=$(date +%s)` to `$GITHUB_ENV`.
2. In the "📋 Write Job Summary" step, compute duration:
   `DURATION=$(( $(date +%s) - AEGIS_START_TIME ))` and add a
   `| **Duration** | ${DURATION}s |` row to the summary table.
3. Add `| **Retry count** | ${ITER_COUNT:-0} |` row (depends on sub-task 4.1
   for `ITER_COUNT`).

**Relevant Context**
- `aegis.yml` lines 316–342: "📋 Write Job Summary" step.
- `aegis.yml` line 37: first step — start time capture goes here.

---

### Sub-task 4.5 — PR enrichment with a structured change table

**Status:** [x] done

**Intent**
Replace the generic "Files Updated" list in the frontend PR body with a
structured markdown table showing exactly which fields changed (field name,
change type, before/after types).

**Expected Outcomes**
- The `RESULT: SYNC_COMPLETE` block in the prompt includes a `FIELD_CHANGES`
  JSON array token.
- `aegis.yml` PR creation step parses that token and renders it as a markdown
  table inserted into the `--body` argument.

**Todo List**
1. In `aegis-master-prompt.md` Step 5 (lines 83–89), extend the
   `RESULT: SYNC_COMPLETE` block with:
   ```
   FIELD_CHANGES: [{"field":"<name>","change":"<added|removed|renamed|type_changed>","before":"<type>","after":"<type>"}]
   ```
2. In `aegis.yml` after the Bob invocation, parse `FIELD_CHANGES` from
   `/tmp/bob-output.json` using `python3 -c` and render a markdown table
   into a file `/tmp/change-table.md`.
3. Replace the static "Files Updated" section in the `gh pr create --body`
   argument with the contents of `/tmp/change-table.md`.

**Relevant Context**
- `aegis-master-prompt.md` lines 83–89: `RESULT: SYNC_COMPLETE` block.
- `aegis.yml` lines 278–306: `gh pr create` call.

---

## Implementation Order

The sub-tasks are independent within each axis. The recommended execution order
minimises merge conflicts — `config.ts` changes first, then prompt changes, then
workflow changes:

1. 1.3 (monorepo support — converts `ALLOWED_FILES` to a function; all Axis 2
   `config.ts` changes should layer on top)
2. 2.1, 2.2, 2.3, 2.5 (remaining `config.ts` `ALLOWED_FILES` additions)
3. 3.1 (`config.ts` call-site additions)
4. 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 3.4 (all prompt changes)
5. 3.5, 4.1, 4.2, 4.3, 4.4, 4.5 (workflow-only changes)
6. 1.1 (matrix strategy — touches most of the workflow; do last to avoid rebasing)
7. 1.2 (repository_dispatch — new file + small workflow addition)
8. 2.4 (SDK publish — new workflow step)

Each sub-task can be executed in Agent mode independently. After completing each
one, re-run `npm test` in `mcp-server/` and `npm run type-check` in
`repo-b-frontend/` to confirm nothing regressed.
