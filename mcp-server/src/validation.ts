// src/validation.ts
import path from 'path';
import { getRepoBBasePath, ALLOWED_FILES } from './config.js';

/**
 * Custom error class for MCP tool errors.
 * Provides structured error information for the agent.
 */
export class McpToolError extends Error {
  constructor(
    public readonly code: 'FILE_NOT_ALLOWED' | 'PATH_TRAVERSAL' | 'FILE_NOT_FOUND' | 'WRITE_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'McpToolError';
  }
}

/**
 * Validates that a file path is:
 * 1. In the ALLOWED_FILES whitelist
 * 2. Does not escape the REPO_B_BASE_PATH boundary (no path traversal)
 *
 * Returns the fully resolved absolute path if valid.
 * Throws McpToolError if invalid.
 */
export function validateAndResolvePath(filePath: string): string {
  // Step 1: Check against whitelist
  if (!ALLOWED_FILES.includes(filePath)) {
    throw new McpToolError(
      'FILE_NOT_ALLOWED',
      `File "${filePath}" is not in the allowed files list. Allowed: ${ALLOWED_FILES.join(', ')}`
    );
  }

  // Step 2: Resolve to absolute path and check boundary
  const repoBBasePath = getRepoBBasePath();
  const resolvedPath = path.resolve(repoBBasePath, filePath);
  const resolvedBase = path.resolve(repoBBasePath);

  // Ensure the resolved path starts with the base path
  // (prevents ../../../etc/passwd style attacks even if somehow in allowlist)
  if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
    throw new McpToolError(
      'PATH_TRAVERSAL',
      `Path traversal detected: "${filePath}" resolves outside the allowed directory`
    );
  }

  return resolvedPath;
}
