// tests/validation.test.ts
import path from 'path';
import os from 'os';
import fs from 'fs';
import { McpToolError, validateAndResolvePath } from '../src/validation.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-val-test-'));

beforeAll(() => {
  // Create the allowed files so realpath can resolve them
  fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'src/types.ts'), '// types\n', 'utf-8');
  fs.writeFileSync(path.join(tmpDir, 'src/schemas.ts'), '// schemas\n', 'utf-8');
});

beforeEach(() => {
  process.env.REPO_B_PATH = tmpDir;
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.REPO_B_PATH;
});

describe('validateAndResolvePath', () => {
  it('accepts src/types.ts', async () => {
    const result = await validateAndResolvePath('src/types.ts');
    expect(result).toBe(path.resolve(tmpDir, 'src/types.ts'));
  });

  it('accepts src/schemas.ts', async () => {
    const result = await validateAndResolvePath('src/schemas.ts');
    expect(result).toBe(path.resolve(tmpDir, 'src/schemas.ts'));
  });

  it('rejects a file not in the allowlist with FILE_NOT_ALLOWED', async () => {
    await expect(validateAndResolvePath('src/other.ts')).rejects.toMatchObject({
      code: 'FILE_NOT_ALLOWED',
    });
  });

  it('rejects an absolute path', async () => {
    await expect(validateAndResolvePath('/etc/passwd')).rejects.toBeInstanceOf(McpToolError);
  });

  it('rejects a traversal path (not in allowlist)', async () => {
    await expect(validateAndResolvePath('../../etc/passwd')).rejects.toBeInstanceOf(McpToolError);
  });

  it('rejects package.json', async () => {
    await expect(validateAndResolvePath('package.json')).rejects.toBeInstanceOf(McpToolError);
  });

  it('throws FILE_NOT_FOUND when an allowed file does not exist on disk', async () => {
    // Temporarily point REPO_B_PATH to a directory where the files don't exist
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-val-empty-'));
    fs.mkdirSync(path.join(emptyDir, 'src'), { recursive: true });
    process.env.REPO_B_PATH = emptyDir;
    try {
      await expect(validateAndResolvePath('src/types.ts')).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
      process.env.REPO_B_PATH = tmpDir;
    }
  });

  it('throws PATH_TRAVERSAL when src/types.ts is a symlink pointing outside the boundary', async () => {
    // Create a separate tmp dir with a real file to link to
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-val-outside-'));
    const outsideFile = path.join(outsideDir, 'secret.txt');
    fs.writeFileSync(outsideFile, 'secret', 'utf-8');

    // Replace src/types.ts with a symlink pointing outside REPO_B_PATH
    const typesPath = path.join(tmpDir, 'src/types.ts');
    fs.unlinkSync(typesPath);
    fs.symlinkSync(outsideFile, typesPath);

    try {
      await expect(validateAndResolvePath('src/types.ts')).rejects.toMatchObject({
        code: 'PATH_TRAVERSAL',
      });
    } finally {
      // Restore the real file for subsequent tests
      fs.unlinkSync(typesPath);
      fs.writeFileSync(typesPath, '// types\n', 'utf-8');
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
