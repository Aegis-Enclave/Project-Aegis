// tests/validation.test.ts
import path from 'path';
import os from 'os';
import fs from 'fs';
import { McpToolError, validateAndResolvePath } from '../src/validation.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-val-test-'));

beforeEach(() => {
  process.env.REPO_B_PATH = tmpDir;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.REPO_B_PATH;
});

describe('validateAndResolvePath', () => {
  it('accepts src/types.ts', () => {
    const result = validateAndResolvePath('src/types.ts');
    expect(result).toBe(path.resolve(tmpDir, 'src/types.ts'));
  });

  it('accepts src/schemas.ts', () => {
    const result = validateAndResolvePath('src/schemas.ts');
    expect(result).toBe(path.resolve(tmpDir, 'src/schemas.ts'));
  });

  it('rejects a file not in the allowlist with FILE_NOT_ALLOWED', () => {
    let caught: McpToolError | undefined;
    try {
      validateAndResolvePath('src/other.ts');
    } catch (err) {
      caught = err as McpToolError;
    }
    expect(caught).toBeInstanceOf(McpToolError);
    expect(caught?.code).toBe('FILE_NOT_ALLOWED');
  });

  it('rejects an absolute path', () => {
    expect(() => validateAndResolvePath('/etc/passwd')).toThrow(McpToolError);
  });

  it('rejects a traversal path (not in allowlist)', () => {
    expect(() => validateAndResolvePath('../../etc/passwd')).toThrow(McpToolError);
  });

  it('rejects package.json', () => {
    expect(() => validateAndResolvePath('package.json')).toThrow(McpToolError);
  });
});
