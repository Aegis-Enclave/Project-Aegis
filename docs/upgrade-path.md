# Project Aegis — Upgrade Path

This document outlines high-impact improvements for Project Aegis to enhance its security, resilience, and production-readiness.

## 1. Containerized Validation Sandbox (Production Readiness)
**Current State:** The Critic agent runs `npm run type-check` natively in the GitHub Actions runner environment.
**The Problem:** Running native npm commands in a shared runner environment poses security risks and can lead to environment pollution, making it unsuitable for a production CI/CD pipeline.
**The Upgrade:** Move the validation step into an isolated Docker container.
**Implementation Steps:**
- Add a `Dockerfile` and `.dockerignore` in the `repo-b-frontend` directory specifically designed for running tests/type-checks.
- Update the GitHub Action workflow (`.github/workflows/aegis.yml`) to build and run the Docker container during the validation phase instead of executing `npm run type-check` directly on the host.
- Pipe the `stderr`/`stdout` out of the container back to the agent for the actor-critic loop.

## 2. Patch Critical Frontend Vulnerabilities
**Current State:** The frontend repository uses `next@14.0.4`.
**The Problem:** This version of Next.js contains known high and critical security vulnerabilities that are flagged during `npm install`.
**The Upgrade:** Upgrade to a patched version of Next.js and resolve associated dependency audit warnings.
**Implementation Steps:**
- Update `package.json` in `repo-b-frontend` to use the latest secure version of Next.js 14.x.
- Run `npm audit fix --force` or update specific packages to clear the vulnerabilities.
- Ensure the Next.js upgrade does not break the `type-check` sandbox.

## 3. Frontend API Resilience
**Current State:** The `fetchUser` logic in `repo-b-frontend/src/lib/api.ts` makes a single fetch attempt.
**The Problem:** If the backend is temporarily unreachable (e.g., during a deployment or cold start), the application will crash or display an error immediately.
**The Upgrade:** Implement an exponential backoff retry mechanism.
**Implementation Steps:**
- Modify `src/lib/api.ts` to include a resilient `fetch` wrapper.
- Configure the wrapper to retry up to 3 times with exponentially increasing delays.
- Fallback gracefully and provide clear error messages to the UI if all retries fail.

## 4. Enhanced PR Feedback Loop
**Current State:** If the Aegis agent fails to resolve frontend types after its maximum iterations, the GitHub Action simply fails, burying the `stderr` logs inside the Actions tab.
**The Problem:** Developers lack immediate visibility into why the automated synchronization failed.
**The Upgrade:** Automatically post validation errors as comments directly on the backend PR.
**Implementation Steps:**
- Add a new step in `.github/workflows/aegis.yml` that captures the final failure state of the type-check.
- Use the GitHub CLI (`gh pr comment`) to push the `stderr` output as a markdown comment on the triggering PR.
- Tag the developer who opened the PR for immediate review.
