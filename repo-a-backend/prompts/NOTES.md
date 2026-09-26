# Prompt Engineering Notes — Project Aegis

## Overview

Observations, learnings, and best practices gathered while developing and iterating on the Aegis master prompt.

## Key Design Decisions

### 1. Full File Overwrite vs. Patch
The `write_frontend_schema` tool performs a full overwrite. This was intentional:
- Simpler agent instruction: "provide the complete file"
- No diff-parsing complexity
- No risk of patch misapplication
- Trade-off: Agent must include ALL existing content it wants to preserve

**Key prompt line:** `"⚠️ IMPORTANT: This is a FULL OVERWRITE."` — this explicit warning prevents the most common mistake of providing only the changed lines.

### 2. Explicit No-Op Path
The prompt explicitly handles the `NO_BREAKING_CHANGES` case with a specific exit format. This prevents the agent from making unnecessary changes when the diff is a non-breaking refactor (e.g., adding a comment, changing a log message, renaming a variable that isn't part of the API response).

### 3. Numbered Steps
Agents follow numbered sequential instructions more reliably than prose. The 5-step plan (ANALYZE → READ → GENERATE → WRITE → VALIDATE) enforces the correct order of operations.

### 4. Negative Rules
The "Critical Rules" section contains explicit prohibitions:
- "NEVER invent fields" — prevents hallucination
- "ALWAYS generate complete files" — prevents partial overwrites
- "Update BOTH files" — ensures consistency between types.ts and schemas.ts

### 5. Enum-Constrained Tool Inputs
The `filePath` input uses an enum (`src/types.ts`, `src/schemas.ts`). This eliminates a class of errors where the agent might try to read/write a non-existent or non-allowed file.

## What Works Well

- The step-by-step format keeps the agent on track
- Explicit output format (`RESULT: SYNC_COMPLETE`) makes parsing predictable
- Reading both files before writing ensures the agent has full context
- The diff injection (`${BACKEND_DIFF}`) keeps the context focused

## Potential Issues & Mitigations

| Issue | Mitigation |
|-------|------------|
| Agent generates partial file content | "ALWAYS generate complete files" rule + full-overwrite warning |
| Agent invents extra fields | "NEVER invent fields" rule |
| Agent only updates one file | "Update BOTH files" rule |
| Agent can't parse complex diffs | Simplify demo to single-field rename |
| Retry loop doesn't converge | Max 3 attempts; stderr fed back to agent |

## Retry Prompt Template

When type-check fails, use this template to feed the error back:

```
## Type-Check Failed — Retry Attempt ${ATTEMPT}/${MAX_ATTEMPTS}

The TypeScript type-check (`tsc --noEmit`) failed with the following errors:

\`\`\`
${STDERR_OUTPUT}
\`\`\`

Analyze these errors carefully:
1. What specific file(s) and line(s) have errors?
2. What is the root cause of each error?
3. What needs to change to fix each error?

Now:
1. Call `read_frontend_schema` to see the current state of the files you wrote
2. Generate corrected code that fixes the reported errors
3. Call `write_frontend_schema` with the corrected code
4. The type-check will run again automatically

Remember: Generate the COMPLETE file content, not just the fix.
```

## Future Improvements

- Add few-shot examples directly in the prompt for edge cases (type changes, enum additions)
- Consider adding a `list_allowed_files` tool to let the agent discover the allowlist dynamically
- For production: extend ALLOWED_FILES to include component files (`src/app/page.tsx`) for full sync
- Consider structured output format (JSON) instead of markdown for more reliable parsing
