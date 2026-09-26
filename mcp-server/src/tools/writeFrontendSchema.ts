// src/tools/writeFrontendSchema.ts
import { writeFile } from 'fs/promises';
import { validateAndResolvePath, McpToolError } from '../validation.js';

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
  const absolutePath = validateAndResolvePath(input.filePath);

  // Validate content is non-empty
  if (!input.content || input.content.trim().length === 0) {
    throw new McpToolError('WRITE_FAILED', 'Cannot write empty content to file');
  }

  // Write file
  try {
    await writeFile(absolutePath, input.content, 'utf-8');
  } catch (err: unknown) {
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
