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
 * Whitelist of files the MCP tools are allowed to read/write.
 * Relative to REPO_B_BASE_PATH.
 * SECURITY: Only these files are accessible — all other paths are rejected.
 */
export const ALLOWED_FILES: string[] = [
  'src/types.ts',
  'src/schemas.ts',
];

/**
 * Server metadata for MCP registration.
 */
export const SERVER_NAME = 'aegis-context-bridge';
export const SERVER_VERSION = '1.0.0';
