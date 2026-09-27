// src/validation.ts
import path from 'path';
import { realpath } from 'fs/promises';
import { getRepoBBasePath, getAllowedFiles } from './config.js';

/**
 * Custom error class for MCP tool errors.
 * Provides structured error information for the agent.
 */
export class McpToolError extends Error {
  constructor(
    public readonly code: 'FILE_NOT_ALLOWED' | 'PATH_TRAVERSAL' | 'FILE_NOT_FOUND' | 'WRITE_FAILED' | 'FILE_TOO_LARGE',
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
 * 3. Exists on disk (non-existent paths are rejected — ENOENT is never a valid state
 *    for allowed files since git clone always creates them)
 * 4. Does not escape the boundary via symlinks (fs.realpath fully dereferences)
 *
 * Returns the fully resolved absolute path if valid.
 * Throws McpToolError if invalid.
 */
export async function validateAndResolvePath(filePath: string): Promise<string> {
  // Step 1: Check against whitelist (evaluated at call time to pick up
  // MONOREPO_FRONTEND_PREFIX and any other runtime env overrides)
  const allowedFiles = getAllowedFiles();
  if (!allowedFiles.includes(filePath)) {
    throw new McpToolError(
      'FILE_NOT_ALLOWED',
      `File "${filePath}" is not in the allowed files list. Allowed: ${allowedFiles.join(', ')}`
    );
  }

  // Step 2: String-based boundary check (fast pre-check before touching the filesystem)
  const repoBBasePath = getRepoBBasePath();
  const resolvedPath = path.resolve(repoBBasePath, filePath);
  const resolvedBase = path.resolve(repoBBasePath);

  if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
    throw new McpToolError(
      'PATH_TRAVERSAL',
      `Path traversal detected: "${filePath}" resolves outside the allowed directory`
    );
  }

  // Step 3: Dereference all symlinks via fs.realpath and re-check the boundary.
  // If the file does not exist, ENOENT is thrown — allowed files must always exist
  // in a properly cloned repo-b. A missing file indicates a broken environment.
  let realPath: string;
  try {
    realPath = await realpath(resolvedPath);
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      throw new McpToolError('FILE_NOT_FOUND', `File not found: ${filePath}`);
    }
    throw err;
  }

  if (!realPath.startsWith(resolvedBase + path.sep) && realPath !== resolvedBase) {
    throw new McpToolError(
      'PATH_TRAVERSAL',
      `Symlink traversal detected: "${filePath}" resolves outside the allowed directory`
    );
  }

  return realPath;
}
