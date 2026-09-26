// src/tools/readFrontendSchema.ts
import { stat, readFile } from 'fs/promises';
import { validateAndResolvePath, McpToolError } from '../validation.js';
import { MAX_FILE_SIZE_BYTES } from '../config.js';

interface ReadInput {
  filePath: string;
}

interface ReadOutput {
  filePath: string;
  content: string;
  lineCount: number;
  sizeBytes: number;
}

/**
 * Reads a frontend schema/type file from the local Repo B clone.
 *
 * Security: File path is validated against an allowlist and checked
 * for path traversal before any filesystem access.
 *
 * @param input - Contains filePath (relative to Repo B root)
 * @returns File content with metadata
 * @throws McpToolError if file is not allowed, path traversal detected, or file not found
 */
export async function readFrontendSchema(input: ReadInput): Promise<ReadOutput> {
  // Validate and resolve path (throws on invalid)
  const absolutePath = await validateAndResolvePath(input.filePath);

  // Check file size before reading to avoid loading large files into memory
  const fileStat = await stat(absolutePath);
  if (fileStat.size > MAX_FILE_SIZE_BYTES) {
    throw new McpToolError(
      'FILE_TOO_LARGE',
      `File "${input.filePath}" is ${fileStat.size} bytes, exceeding the ${MAX_FILE_SIZE_BYTES}-byte limit`
    );
  }

  // Read file
  let content: string;
  try {
    content = await readFile(absolutePath, 'utf-8');
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      throw new McpToolError('FILE_NOT_FOUND', `File not found: ${input.filePath}`);
    }
    throw err; // Re-throw unexpected errors
  }

  return {
    filePath: input.filePath,
    content,
    lineCount: content.split('\n').length,
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
  };
}
