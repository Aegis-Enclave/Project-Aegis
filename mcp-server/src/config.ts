// src/config.ts
import path from 'path';

/**
 * Returns the base path to the local clone of Repo B (frontend).
 * Evaluated at call time so tests can override process.env.REPO_B_PATH.
 * In CI: set by the GitHub Action after cloning.
 * Locally: defaults to ./repo-b relative to CWD.
 */
export function getRepoBBasePath(): string {
  return path.resolve(process.env.REPO_B_PATH || './repo-b');
}

/**
 * Returns the whitelist of files the MCP tools are allowed to read/write.
 * Relative to REPO_B_BASE_PATH. Evaluated at call time so that
 * MONOREPO_FRONTEND_PREFIX can be overridden per-run (e.g. in CI or tests).
 *
 * When MONOREPO_FRONTEND_PREFIX is set (e.g. "packages/frontend"), every path
 * is prefixed with that value so monorepo-relative paths are accepted.
 *
 * SECURITY: Only these files are accessible — all other paths are rejected.
 */
export function getAllowedFiles(): string[] {
  const base: string[] = [
    'src/types.ts',
    'src/schemas.ts',
    // Axis 2 — contract formats
    'src/openapi.yaml',
    'src/models.py',
    'src/models.go',
    'src/models.rs',
    'src/schema.graphql',
    'src/contract.schema.json',
    // Axis 3 — call-site files
    'src/app/page.tsx',
    'src/lib/api.ts',
  ];
  const prefix = process.env.MONOREPO_FRONTEND_PREFIX;
  if (prefix) {
    const trimmed = prefix.replace(/\/$/, '');
    return base.map((f) => `${trimmed}/${f}`);
  }
  return base;
}

/**
 * @deprecated Use getAllowedFiles() instead. Kept for backward compatibility
 * with any external code that imported this constant directly.
 */
export const ALLOWED_FILES: string[] = getAllowedFiles();

/**
 * Maximum allowed file size for MCP read/write operations (512 KB).
 * Prevents memory exhaustion from unexpectedly large files.
 */
export const MAX_FILE_SIZE_BYTES = 512 * 1024; // 524 288 bytes

/**
 * Server metadata for MCP registration.
 */
export const SERVER_NAME = 'aegis-context-bridge';
export const SERVER_VERSION = '1.0.0';
