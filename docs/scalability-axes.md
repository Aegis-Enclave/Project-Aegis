# Project Aegis — Scalability Axes

This document maps concrete improvement ideas across four scaling dimensions. Every
claim is grounded in the actual source files. Each entry identifies the exact files
and lines that need to change, so the scope of any individual improvement is clear
before implementation begins.

---

## Axis 1 — One-to-Many Repo Relationships

**Current state:** [`aegis.yml` line 30](../repo-a-backend/.github/workflows/aegis.yml)
has `FRONTEND_REPO: Aegis-Enclave/repo-b-frontend` hardcoded. One backend PR triggers
one clone, one Bob run, one frontend PR.

### Fan-out sync

One backend change triggers PRs across multiple frontend consumers simultaneously
(e.g. a mobile client repo, an internal admin repo, and a public web app all
consuming the same API).

**Touch points:**
- `aegis.yml` only — `FRONTEND_REPO` becomes a YAML list; the clone → Bob → PR
  sequence becomes a `matrix` job strategy. Each matrix entry gets its own
  `REPO_B_PATH` (e.g. `./repo-b-web`, `./repo-b-mobile`), its own clone step, its
  own Bob invocation, and its own `gh pr create`.
- Nothing in `mcp-server/` changes — `REPO_B_PATH` is already read at runtime from
  the environment in [`getRepoBBasePath()`](../mcp-server/src/config.ts).

### Dependency graph awareness

If Backend A feeds Backend B which feeds Frontend C, Aegis propagates changes through
the chain.

**Touch points:**
- A new config file (e.g. `aegis-consumers.yml` in the backend repo) declares
  downstream consumers.
- A new step in `aegis.yml` emits a `repository_dispatch` event to each downstream
  backend repo after syncing, which fires that repo's own `aegis.yml`.
- No Bob or MCP changes required — pure CI topology.

### Mono-repo support

Instead of cross-repo PRs, sync types within a monorepo using workspace-relative
paths.

**Touch points:**
- `aegis.yml` — set `REPO_B_PATH: ./packages/frontend` and skip the `git clone`
  step; the checkout already has the full tree.
- [`ALLOWED_FILES` in `config.ts` line 19](../mcp-server/src/config.ts) — update
  the two hardcoded paths to match the monorepo-relative paths (e.g.
  `packages/frontend/src/types.ts`). One-line change.

---

## Axis 2 — One File Type → Many Contract Formats

**Current state:** Bob only writes TypeScript (`types.ts` + `schemas.ts`). The MCP
allowlist in [`mcp-server/src/config.ts` line 19](../mcp-server/src/config.ts) is
hardcoded to exactly two paths. The MCP tools themselves (`readFrontendSchema`,
`writeFrontendSchema`) do raw string read/write and are already format-agnostic —
no tool implementation changes are required for any new format.

Every new contract format requires exactly **two changes**:

1. Add the new file path to [`ALLOWED_FILES`](../mcp-server/src/config.ts) — that
   is the only security gate.
2. Extend [`aegis-master-prompt.md`](../repo-a-backend/prompts/aegis-master-prompt.md)
   to tell Bob to read and write the new file (either by extending the existing steps
   or by adding a specialist prompt).

### OpenAPI spec generation

Derive an `openapi.yaml` from the backend diff and commit it alongside the type
changes.

**Touch points:** `config.ts` line 19 (add `src/openapi.yaml`) + prompt (add write
step for the YAML file).

### Multi-language clients

Generate Python Pydantic models, Go structs, Rust serde structs, or Java POJOs from
the same diff.

**Touch points:** `config.ts` line 19 (add target file path per language) + a
specialist prompt per language format.

### GraphQL schema sync

If the backend exposes a GraphQL layer, update `.graphql` schema files.

**Touch points:** `config.ts` line 19 (add `src/schema.graphql`) + prompt extension.

### SDK auto-publish

After syncing types, trigger an npm/PyPI publish of a versioned client SDK.

**Touch points:** `aegis.yml` only — add a new step after the frontend PR is created
that runs `npm publish` from the cloned repo directory. No MCP involvement.

### JSON Schema generation

Produce a `contract.schema.json` for runtime validation outside TypeScript.

**Touch points:** `config.ts` line 19 (add `src/contract.schema.json`) + prompt
extension.

---

## Axis 3 — Smarter Agent Behavior

**Current state:** Bob follows a rigid 5-step prompt in
[`aegis-master-prompt.md`](../repo-a-backend/prompts/aegis-master-prompt.md) and
only modifies type definition files. Retries are blind (no structured error context
fed back). Change classification is binary (breaking or not).

### Consuming code sync

Bob currently stops at `types.ts` and `schemas.ts`, but `page.tsx` still hardcodes
`user.user_id`. Extend Bob's scope to also update call-site references.

**Touch points:**
- [`ALLOWED_FILES` in `config.ts` line 19](../mcp-server/src/config.ts) — add
  `src/app/page.tsx` and `src/lib/api.ts`.
- [`aegis-master-prompt.md`](../repo-a-backend/prompts/aegis-master-prompt.md) — add
  a new step after Step 4 to read and update call-site references.

### Deprecation-first strategy

Instead of a hard rename, Bob first adds the new field alongside the old one, flags
the old field `@deprecated`, then removes it in a follow-up PR after a grace period.

**Touch points:**
- Prompt only — replace the Step 3 generation rules
  ([lines 63–75](../repo-a-backend/prompts/aegis-master-prompt.md)) with a two-phase
  rule: "If the change is a rename, add the new field AND mark the old field
  `/** @deprecated */` — do NOT remove it." The removal PR is a second Bob invocation
  on a timer-based workflow.

### Semantic change classification

Teach Bob to distinguish additive changes (new optional field — safe) from breaking
changes (rename, removal, type narrowing — PR required) and act differently per class.

**Touch points:**
- Prompt only — extend Step 1
  ([lines 36–47](../repo-a-backend/prompts/aegis-master-prompt.md)) with a third
  outcome: `ADDITIVE_CHANGE` (write the files, but label the PR differently and skip
  the "breaking change" warning).

### Confidence scoring

Bob reports a confidence level on its generated output; low-confidence changes get a
human review request added to the PR rather than auto-merging.

**Touch points:**
- Prompt — extend the `RESULT: SYNC_COMPLETE` block
  ([lines 83–89](../repo-a-backend/prompts/aegis-master-prompt.md)) to include a
  `CONFIDENCE: HIGH | MEDIUM | LOW` token.
- `aegis.yml` — parse the token from `/tmp/bob-output.json` in the PR creation step
  ([lines 239–267](../repo-a-backend/.github/workflows/aegis.yml)) and conditionally
  add `--reviewer` flags or a "needs-human-review" label.

### Self-healing retry with structured error context

Today Bob retries up to 3 times on `tsc` failure but has no memory between attempts.
The type-check output is already saved to `/tmp/type-check-output.txt`
([line 162](../repo-a-backend/.github/workflows/aegis.yml)) and already displayed in
the failure PR comment ([line 170](../repo-a-backend/.github/workflows/aegis.yml)) —
it is just never fed back to Bob.

**Touch points:**
- `aegis.yml` only — add one conditional step between the type-check step and the PR
  creation step that re-invokes Bob with the contents of
  `/tmp/type-check-output.txt` appended to the original prompt as structured error
  context.

---

## Axis 4 — Observability & Operational Maturity

**Current state:** Silent failures. If Bob hits max retries the workflow exits with no
notification beyond the existing failure PR comment
([lines 165–190](../repo-a-backend/.github/workflows/aegis.yml)). There is no audit
log, no metrics, no dashboard, and no structured output format.

### Structured run logs

Emit a JSON summary at the end of each run: what changed, what Bob generated,
pass/fail, retry count, PR link.

**Touch points:**
- `aegis.yml` only — add a final step that assembles a JSON object from
  already-available variables (`github.event.pull_request.number`, diff line count,
  Bob output from `/tmp/bob-output.json`, type-check result from
  `/tmp/type-check-output.txt`) and writes it to `$GITHUB_STEP_SUMMARY`. Appears
  in the Actions UI with no new secrets or services.

### Failure notifications

Post to Slack/Teams/GitHub issue when the agent exhausts retries or the type-check
never passes.

**Touch points:**
- `aegis.yml` only — add a `curl` call to a Slack/Teams webhook URL (stored as a
  secret) inside the existing failure step at
  [line 165](../repo-a-backend/.github/workflows/aegis.yml). The `if: failure()`
  condition is already the right pattern.

### Contract changelog

Maintain a `CHANGELOG.md` in the frontend repo that Aegis auto-appends to on every
sync, recording field-level changes with dates and backend PR links.

**Touch points:**
- `aegis.yml` only — add a step after Bob execution and before PR creation that
  appends a changelog entry to `$REPO_B_PATH/CHANGELOG.md`. The `git add -A` at
  [line 224](../repo-a-backend/.github/workflows/aegis.yml) already stages all
  changes, so the changelog file is included in the commit automatically.

### Metrics emission

Track sync success rate, time-to-sync, and retry frequency over time.

**Touch points:**
- `aegis.yml` only — emit timing data (`${{ github.event.pull_request.created_at }}`
  vs step completion time) and result codes to a metrics endpoint or GitHub
  Environments deployment status. No new infrastructure required if using GitHub's
  built-in job summaries.

### PR enrichment with a structured change table

Add a table to the auto-created frontend PR body showing exactly which fields changed
(added / removed / renamed / type-changed) with before/after values.

**Touch points:**
- Prompt — extend the `RESULT: SYNC_COMPLETE` output format
  ([lines 83–89](../repo-a-backend/prompts/aegis-master-prompt.md)) to include a
  structured JSON block listing each field change.
- `aegis.yml` — parse that JSON in the `gh pr create` step
  ([lines 243–267](../repo-a-backend/.github/workflows/aegis.yml)) and interpolate
  it as a markdown table into the `--body` argument before the PR is created.

---

## Touch-point summary

| Idea | Files changed | Scope |
|---|---|---|
| Fan-out to multiple frontends | `aegis.yml` | Add matrix strategy |
| Dependency graph chaining | `aegis.yml` | Add `repository_dispatch` emit step |
| Monorepo support | `aegis.yml` + `config.ts` L19 | Skip clone, update `ALLOWED_FILES` |
| OpenAPI / multi-format generation | `config.ts` L19 + prompt | Add path to allowlist + extend prompt |
| SDK auto-publish | `aegis.yml` | New publish step after PR creation |
| Consuming code sync | `config.ts` L19 + prompt | Add `page.tsx`, `api.ts` to allowlist + extend prompt |
| Deprecation-first strategy | Prompt only | Rewrite Step 3 generation rules |
| Semantic change classification | Prompt only | Extend Step 1 outcomes |
| Confidence scoring | Prompt + `aegis.yml` | Add token to result format, parse in PR step |
| Self-healing retry | `aegis.yml` only | Feed type-check output back into Bob |
| Structured run logs | `aegis.yml` only | Add `GITHUB_STEP_SUMMARY` step |
| Failure notifications | `aegis.yml` only | Add webhook `curl` to existing failure step |
| Contract changelog | `aegis.yml` only | Append to `CHANGELOG.md` before commit |
| PR enrichment with change table | Prompt + `aegis.yml` | Extend `RESULT:` format, parse into PR body |
