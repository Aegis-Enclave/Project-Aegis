# Demo Video Script: Project Aegis (3 Minutes)

**Objective:** Clearly demonstrate the problem (integration drift) and the solution (Project Aegis autonomous CI/CD using IBM Bob 2.0).
**Tone:** Fast-paced, technical, but easy to understand.

---

### Scene 1: The Problem & "Before" State (0:00 - 0:30)
**Visual:** Split screen. On the left, Repo A (Node.js Backend). On the right, Repo B (Next.js Frontend). Show the frontend successfully fetching data from the backend in a terminal or browser.
**Audio (Voiceover):** 
> "Welcome to Project Aegis. In microservice architectures, when a backend developer changes an API, the frontend often breaks because the types get out of sync. This is called integration drift. Today, we're fixing this autonomously using IBM Bob 2.0."
> "Here, we have a Node.js backend and a Next.js frontend perfectly in sync. The frontend expects a user object with a `user_id` field."

### Scene 2: The Incident (0:30 - 0:50)
**Visual:** Open VS Code on Repo A. Change `user_id` to `uuid` in the backend API mock. Commit the code and open a Pull Request on GitHub.
**Audio:**
> "Let's cause some trouble. I'm a backend developer, and I'm updating our database schema. I'm renaming `user_id` to `uuid` and opening a Pull Request."
> "Normally, this would break the frontend build and cause a headache for the UI team. But Project Aegis is watching."

### Scene 3: The Magic (GitHub Actions & Bob) (0:50 - 1:50)
**Visual:** Switch to the GitHub Actions tab in Repo A. Click into the running workflow. Expand the logs to show Bob Shell running. Highlight the MCP server starting and Bob reasoning.
**Audio:**
> "The Pull Request triggers our Project Aegis GitHub Action. Under the hood, this spins up a headless instance of IBM Bob."
> "Because Bob only has access to the backend repo by default, we built a custom Model Context Protocol (MCP) server. This acts as a secure bridge, giving Bob the tools to read and write to the frontend repo."
> "Look at the logs: Bob's Planner agent sees the PR diff and realizes the frontend data contract is broken. It hands off to the Implementer agent, which uses our MCP tools to rewrite the Zod schemas and TypeScript interfaces. Finally, the Critic agent natively runs a type-check in the runner to guarantee the code works."

### Scene 4: The Resolution (1:50 - 2:30)
**Visual:** Switch to Repo B (Frontend) on GitHub. Show a brand new, automatically generated Pull Request. Open the PR diff to show `user_id` changed to `uuid` in `types.ts` and the Zod schema.
**Audio:**
> "Let's look at the frontend repository. Project Aegis has automatically opened a synchronized Pull Request! It perfectly updated the TypeScript interfaces and Zod schemas to match the new backend schema."
> "The frontend team doesn't have to lift a finger. The code is already tested and ready to merge."

### Scene 5: Outro & Future Architecture (2:30 - 3:00)
**Visual:** Show a quick architectural diagram of Project Aegis (Backend PR -> Action -> Bob + MCP -> Sandbox -> Frontend PR).
**Audio:**
> "For this hackathon, our Critic agent ran natively in the CI runner. For production, Project Aegis will execute these validation steps in isolated, ephemeral Docker containers to ensure strict security boundaries."
> "Project Aegis eliminates integration drift, saving hours of cross-team coordination. Thank you from the Aegis Enclave team."
