// tests/readFrontendSchema.test.ts
import path from 'path';
import os from 'os';
import fs from 'fs';
import { readFrontendSchema } from '../src/tools/readFrontendSchema.js';
import { McpToolError } from '../src/validation.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-read-test-'));

const TYPES_CONTENT = `export interface User {\n  user_id: string;\n  name: string;\n}\n`;
const SCHEMAS_CONTENT = `import { z } from 'zod';\nexport const UserSchema = z.object({ user_id: z.string() });\n`;

beforeAll(() => {
  process.env.REPO_B_PATH = tmpDir;
  fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'src/types.ts'), TYPES_CONTENT, 'utf-8');
  fs.writeFileSync(path.join(tmpDir, 'src/schemas.ts'), SCHEMAS_CONTENT, 'utf-8');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.REPO_B_PATH;
});

describe('readFrontendSchema', () => {
  it('reads src/types.ts correctly', async () => {
    const result = await readFrontendSchema({ filePath: 'src/types.ts' });
    expect(result.filePath).toBe('src/types.ts');
    expect(result.content).toBe(TYPES_CONTENT);
    expect(result.lineCount).toBe(TYPES_CONTENT.split('\n').length);
    expect(result.sizeBytes).toBe(Buffer.byteLength(TYPES_CONTENT, 'utf-8'));
  });

  it('reads src/schemas.ts correctly', async () => {
    const result = await readFrontendSchema({ filePath: 'src/schemas.ts' });
    expect(result.content).toBe(SCHEMAS_CONTENT);
  });

  it('throws FILE_NOT_ALLOWED for unlisted file', async () => {
    let caught: McpToolError | undefined;
    try {
      await readFrontendSchema({ filePath: 'src/server.ts' });
    } catch (err) {
      caught = err as McpToolError;
    }
    expect(caught).toBeInstanceOf(McpToolError);
    expect(caught?.code).toBe('FILE_NOT_ALLOWED');
  });

  it('throws FILE_NOT_ALLOWED for traversal attempt', async () => {
    await expect(readFrontendSchema({ filePath: '../../etc/passwd' })).rejects.toThrow(McpToolError);
  });

  it('throws FILE_NOT_FOUND when allowed file is missing', async () => {
    const typesPath = path.join(tmpDir, 'src/types.ts');
    fs.renameSync(typesPath, typesPath + '.bak');
    try {
      await expect(readFrontendSchema({ filePath: 'src/types.ts' })).rejects.toMatchObject({
        code: 'FILE_NOT_FOUND',
      });
    } finally {
      fs.renameSync(typesPath + '.bak', typesPath);
    }
  });

  it('throws FILE_TOO_LARGE when file on disk exceeds 512 KB', async () => {
    const schemasPath = path.join(tmpDir, 'src/schemas.ts');
    const original = fs.readFileSync(schemasPath, 'utf-8');
    // Write an oversized file directly (bypassing the write tool)
    fs.writeFileSync(schemasPath, 'x'.repeat(512 * 1024 + 1), 'utf-8');
    try {
      await expect(readFrontendSchema({ filePath: 'src/schemas.ts' })).rejects.toMatchObject({
        code: 'FILE_TOO_LARGE',
      });
    } finally {
      fs.writeFileSync(schemasPath, original, 'utf-8');
    }
  });
});
