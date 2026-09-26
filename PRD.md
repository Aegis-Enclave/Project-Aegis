# Product Requirements Document (PRD): Project Aegis

## 1. Executive Summary
**Project Aegis** is an autonomous CI/CD agent built with IBM Bob 2.0 and the Model Context Protocol (MCP). It solves the problem of "integration drift" between decoupled microservices. When a backend developer introduces a breaking API change, Project Aegis automatically detects the change, updates the affected frontend TypeScript interfaces and Zod schemas, tests the changes, and submits a synchronized pull request to the frontend repository. 

**Timeline:** 24-hour hackathon sprint (IBM Bob 2.0 Hackathon).
**Goal:** Deliver a working proof-of-concept using mock repositories and a custom MCP server.

## 2. Core Architecture

### 2.1 Trigger
- A developer opens a Pull Request on **Repo A (Backend)** modifying a mock API response payload (built with Node.js/Express).
- A GitHub Action (`on: pull_request`) detects the PR and spins up a headless instance of **Bob Shell**.

### 2.2 The Context Bridge (MCP Server)
- **Problem:** Bob Shell running in Repo A cannot natively read/write Repo B.
- **Solution:** A custom MCP Server built with Express/Node.js running in the background. The GitHub Action will clone **Repo B** into a local subdirectory (e.g., `./repo-b`).
- **Tools Provided to Bob:**
  - `read_frontend_schema`: Fetches the Next.js `types.ts` (and Zod schemas) from the local `./repo-b` directory.
  - `write_frontend_schema`: Overwrites the `types.ts` file in the local `./repo-b` directory.

### 2.3 The Execution Loop (Subagents)
1. **Planner Agent:** Analyzes the `git diff` of the backend PR and determines if the frontend data contracts will break. *(Note: IBM Bob 2.0 utilizes dynamic multi-model orchestration, automatically selecting the best LLM for the task. We will rely on its native orchestration).*
2. **Implementer Agent:** Uses the MCP tools to read the frontend code, generate the updated TypeScript/Zod code, and write it back to the local clone.
3. **Critic Agent (Sandbox):** Runs a validation command (`npm run type-check`) natively on the GitHub Actions runner environment for speed.
   - *If it fails:* The stderr output is fed back to the Implementer.
   - *If it passes:* The process moves to resolution.
   - *(Future Implementation: For production, this sandbox step will be executed inside an isolated Docker container to prevent environment pollution and ensure strict security boundaries).*

### 2.4 Resolution
- Using standard Git commands, the Action commits the changes made to `./repo-b` and pushes a Pull Request directly to **Repo B (Frontend)** containing the fixed schemas.

## 3. 24-Hour Execution Checklist

### Phase 1: Setup Mock Repositories (Hours 0-2)
- [ ] **Repo A (Backend):** Create a mock API in Node.js/Express returning a `User` object.
- [ ] **Repo B (Frontend):** Create a minimal Next.js app with a TS interface and Zod schema matching the `User` object.
- [ ] **GitHub Setup:** Push both to GitHub and configure PATs for cross-repo access.

### Phase 2: Build the MCP Server (Hours 2-8)
- [ ] **Initialize Node.js App:** Setup basic Express server for MCP.
- [ ] **Implement MCP SDK:** Register the server using the official IBM Bob MCP SDK.
- [ ] **Tool 1 (`read_frontend_schema`):** Read `types.ts` from local filesystem.
- [ ] **Tool 2 (`write_frontend_schema`):** Overwrite `types.ts` on local filesystem.
- [ ] **Local Testing:** Ensure Bob Shell can connect and execute tools manually.

### Phase 3: Bob Shell & CI Integration (Hours 8-14)
- [ ] **GitHub Action YAML:** Create action in Repo A triggered `on: pull_request`.
- [ ] **Environment Setup:** Checkout Repo A, clone Repo B into `./repo-b`, install Bob Shell, and start MCP server in the background.
- [ ] **Secrets Management:** Pass required API Keys and `GITHUB_TOKEN` to the Action.

### Phase 4: Prompt Engineering & Actor-Critic Loop (Hours 14-18)
- [ ] **Planner Prompt:** "Evaluate this backend diff. Does it break the frontend User contract?"
- [ ] **Implementer Prompt:** "Call `read_frontend_schema`, update the code, call `write_frontend_schema`."
- [ ] **Critic Simulation:** "Run `npm run type-check` in `./repo-b`. If it fails, fix the code and retry."

### Phase 5: Demo Recording & Submission (Hours 18-24)
- [ ] **Follow Demo Script:** Execute the steps in `script.md`.
- [ ] **Submission:** Upload video and submit to Lablab.ai Devpost.
