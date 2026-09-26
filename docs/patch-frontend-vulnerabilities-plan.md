# Plan: Patch Critical Frontend Vulnerabilities

## Overview

**Goal:** Upgrade `next` from `14.0.4` to the latest patched `14.x` release in `repo-b-frontend`, clear all high/critical `npm audit` warnings introduced by that old version, and confirm the Docker-based `type-check` validation sandbox still passes cleanly.

**Scope:** `repo-b-frontend/package.json`, `repo-b-frontend/package-lock.json`. No logic changes to source files unless a type or API signature changes between Next.js patch versions forces a correction.

**Out of scope:** Upgrading to Next.js 15, modifying the Docker image base, changing TypeScript config, or touching the MCP server or backend.

**Approach:** Pin `next` to the latest `14.x` patch (currently `14.2.x` as of mid-2025 — confirm with `npm info next dist-tags`), regenerate the lockfile, run `npm audit` to confirm no remaining high/critical issues, then verify `npm run type-check` (and its Docker equivalent) still passes.

---

## Sub-Tasks

---

### Sub-Task 1 — Determine the Target Version

**Intent:** Identify the exact latest patched release of Next.js 14 before touching any files, so the upgrade targets a known-good version.

**Expected Outcomes:**
- A specific version string for `next` (e.g. `14.2.29`) confirmed as the latest `14.x` with no outstanding critical CVEs.

**Todo List:**
1. Run `npm info next dist-tags` (or check `npmjs.com`) to get `latest` and `latest-14` dist-tags.
2. Cross-reference the chosen version against the [Next.js security advisories](https://nextjs.org/blog/security) and the relevant CVE list (known issues in `14.0.4` include SSRF and HTTP header injection).
3. Record the chosen target version in this plan file before proceeding.

**Relevant Context:**
- Current pinned version: `"next": "14.0.4"` in [`repo-b-frontend/package.json`](repo-b-frontend/package.json:13)
- Known CVEs in `14.0.4`: CVE-2024-34351 (SSRF via Host header), CVE-2024-46982 (cache poisoning), CVE-2025-29927 (middleware auth bypass) — all fixed in `14.2.x` patch series

**Target Version:** `14.2.35` (`next-14` dist-tag — latest stable 14.x as of implementation)

**Status:** [x] done

---

### Sub-Task 2 — Update `package.json` and Regenerate the Lockfile

**Intent:** Bump the pinned `next` version to the confirmed target and produce a fresh, audit-clean `package-lock.json`.

**Expected Outcomes:**
- `repo-b-frontend/package.json` has `"next": "<target-version>"` (exact pin, no caret).
- `repo-b-frontend/package-lock.json` is regenerated with the new resolution tree.
- `npm audit` reports zero high or critical vulnerabilities.

**Todo List:**
1. In [`repo-b-frontend/package.json`](repo-b-frontend/package.json:13), change `"next": "14.0.4"` to `"next": "<target-version>"`.
2. From inside `repo-b-frontend/`, run `npm install` to regenerate `package-lock.json`.
3. Run `npm audit --audit-level=high` and confirm the output is clean (exit 0).
4. If audit still flags transitive vulnerabilities, run `npm audit fix` (without `--force`) to apply safe resolutions; only use `--force` if no breaking changes are confirmed for the pinned range.
5. Commit the updated `package.json` and `package-lock.json`.

**Relevant Context:**
- [`repo-b-frontend/package.json`](repo-b-frontend/package.json) — current dependencies
- The Dockerfile uses `npm ci` ([`repo-b-frontend/Dockerfile`](repo-b-frontend/Dockerfile:15)), so a valid lockfile is required
- Peer deps (`react ^18`, `react-dom ^18`, `typescript ^5`) are all compatible with Next.js `14.2.x` — no peer dep changes expected
- `zod ^3.22.4` has no known coupling to Next.js version

**Audit Note:** After upgrading to `14.2.35`, `npm audit` still reports 2 vulnerabilities (1 high, 1 critical) for `next` and its transitive `postcss` dep. The npm advisory DB marks the entire `9.x–16.x` range as affected with the only "fix" being `next@16.3.6` (a semver-major breaking change, out of scope). The specific CVEs that were exploitable in `14.0.4` (CVE-2024-34351, CVE-2025-29927, CVE-2024-46982) are patched in `14.2.x`. `npm audit fix --force` was intentionally NOT run as it would install Next.js 16.

**Status:** [x] done

---

### Sub-Task 3 — Verify the Type-Check Validation Sandbox

**Intent:** Confirm that the Docker-based type-check still passes after the Next.js upgrade, since the Dockerfile drives the Critic agent's validation oracle in CI.

**Expected Outcomes:**
- `npm run type-check` exits 0 locally inside `repo-b-frontend/`.
- If Docker is available locally: `docker build` and `docker run` both succeed with exit code 0.
- If Docker is NOT available locally: the plan notes this and Docker validation is deferred to CI (the existing `aegis.yml` Docker build step acts as the gate).

**Todo List:**
1. From `repo-b-frontend/`, run `npm run type-check` locally and confirm zero errors.
2. Check whether Docker is available: run `docker info` (exit 0 = available, non-zero = not available).
3. **If Docker is available locally:**
   a. Build the image: `docker build -t aegis-typecheck-test repo-b-frontend/`.
   b. Run the container: `docker run --rm aegis-typecheck-test` and confirm exit code 0.
4. **If Docker is NOT available locally:**
   a. Note in this plan file that Docker validation will be confirmed by the CI run.
   b. Ensure the committed `package-lock.json` is valid (i.e. `npm ci` would succeed) so the CI Docker build is not broken.
5. If any TypeScript errors appear at any point, diagnose whether they are caused by changed Next.js type definitions (common in patch series) and apply minimal fixes to the affected source files only.

**Relevant Context:**
- [`repo-b-frontend/Dockerfile`](repo-b-frontend/Dockerfile) — uses `npm ci` then `CMD ["npm", "run", "type-check"]`
- [`repo-b-frontend/tsconfig.json`](repo-b-frontend/tsconfig.json) — `"strict": true`, `moduleResolution: "bundler"`
- AGENTS.md: `repo-b-frontend` has no test suite by design — the validation oracle is `tsc --noEmit` only

**Docker Result (local):** Docker was available. Image built and ran successfully — `tsc --noEmit` inside container exits 0. No TypeScript errors introduced by the `14.0.4 → 14.2.35` upgrade.

**Status:** [x] done

---

## Decisions Confirmed

| Decision | Answer |
|----------|--------|
| Target version selection | Agent picks highest `14.x` with a clean audit result |
| Docker availability | Check locally first; fall back to CI validation if unavailable |
| `npm audit fix` scope | Safe resolutions allowed; `--force` only if confirmed non-breaking |
