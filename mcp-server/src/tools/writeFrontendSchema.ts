// src/tools/writeFrontendSchema.ts
import { writeFile, rename, unlink } from 'fs/promises';
import path from 'path';
import { validateAndResolvePath, McpToolError } from '../validation.js';
import { MAX_FILE_SIZE_BYTES } from '../config.js';

interface WriteInput {
  filePath: string;
  content: string;
}

interface WriteOutput {
  filePath: string;
  bytesWritten: number;
  lineCount: number;
  success: true;
}

/**
 * Writes (overwrites) a frontend schema/type file in the local Repo B clone.
 *
 * This is a FULL OVERWRITE operation — the entire file content is replaced.
 * The calling agent must provide the complete desired file content.
 *
 * Security: File path is validated against an allowlist and checked
 * for path traversal before any filesystem access.
 *
 * @param input - Contains filePath and complete new content
 * @returns Write confirmation with metadata
 * @throws McpToolError if file is not allowed, path traversal detected, or write fails
 */
export async function writeFrontendSchema(input: WriteInput): Promise<WriteOutput> {
  // Validate and resolve path (throws on invalid)
  const absolutePath = await validateAndResolvePath(input.filePath);

  // Validate content is non-empty
  if (!input.content || input.content.trim().length === 0) {
    throw new McpToolError('WRITE_FAILED', 'Cannot write empty content to file');
  }

  // Reject oversized content before touching the filesystem
  const contentBytes = Buffer.byteLength(input.content, 'utf-8');
  if (contentBytes > MAX_FILE_SIZE_BYTES) {
    throw new McpToolError(
      'FILE_TOO_LARGE',
      `Content is ${contentBytes} bytes, exceeding the ${MAX_FILE_SIZE_BYTES}-byte limit`
    );
  }

  // Atomic write: write to a .tmp sibling then rename into place.
  // On POSIX (Linux/macOS, including GitHub Actions ubuntu-latest), rename(2)
  // is atomic — a crash between write and rename leaves the original untouched.
  const tmpPath = path.join(path.dirname(absolutePath), '.' + path.basename(absolutePath) + '.tmp');
  try {
    await writeFile(tmpPath, input.content, 'utf-8');
    await rename(tmpPath, absolutePath);
  } catch (err: unknown) {
    // Best-effort cleanup of the tmp file if rename failed
    await unlink(tmpPath).catch(() => undefined);
    const error = err as Error;
    throw new McpToolError('WRITE_FAILED', `Failed to write file: ${error.message}`);
  }

  return {
    filePath: input.filePath,
    bytesWritten: Buffer.byteLength(input.content, 'utf-8'),
    lineCount: input.content.split('\n').length,
    success: true,
  };
}
