// tests/writeFrontendSchema.test.ts
import path from 'path';
import os from 'os';
import fs from 'fs';
import { writeFrontendSchema } from '../src/tools/writeFrontendSchema.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-write-test-'));

beforeAll(() => {
  process.env.REPO_B_PATH = tmpDir;
  fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'src/types.ts'), '// initial\n', 'utf-8');
  fs.writeFileSync(path.join(tmpDir, 'src/schemas.ts'), '// initial\n', 'utf-8');
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.REPO_B_PATH;
});

describe('writeFrontendSchema', () => {
  it('overwrites src/types.ts with new content', async () => {
    const newContent = `export interface User {\n  uuid: string;\n  name: string;\n}\n`;
    const result = await writeFrontendSchema({ filePath: 'src/types.ts', content: newContent });
    expect(result.success).toBe(true);
    expect(result.filePath).toBe('src/types.ts');
    expect(result.bytesWritten).toBe(Buffer.byteLength(newContent, 'utf-8'));
    const onDisk = fs.readFileSync(path.join(tmpDir, 'src/types.ts'), 'utf-8');
    expect(onDisk).toBe(newContent);
  });

  it('overwrites src/schemas.ts with new content', async () => {
    const newContent = `import { z } from 'zod';\nexport const UserSchema = z.object({ uuid: z.string() });\n`;
    const result = await writeFrontendSchema({ filePath: 'src/schemas.ts', content: newContent });
    expect(result.success).toBe(true);
    const onDisk = fs.readFileSync(path.join(tmpDir, 'src/schemas.ts'), 'utf-8');
    expect(onDisk).toBe(newContent);
  });

  it('confirms full overwrite (write A then write B, file contains only B)', async () => {
    const contentA = `// version A\nexport interface User { user_id: string; }\n`;
    const contentB = `// version B\nexport interface User { uuid: string; }\n`;
    await writeFrontendSchema({ filePath: 'src/types.ts', content: contentA });
    await writeFrontendSchema({ filePath: 'src/types.ts', content: contentB });
    const onDisk = fs.readFileSync(path.join(tmpDir, 'src/types.ts'), 'utf-8');
    expect(onDisk).toBe(contentB);
    expect(onDisk).not.toContain('user_id');
  });

  it('throws WRITE_FAILED for empty content', async () => {
    await expect(
      writeFrontendSchema({ filePath: 'src/types.ts', content: '' })
    ).rejects.toMatchObject({ code: 'WRITE_FAILED' });
  });

  it('throws WRITE_FAILED for whitespace-only content', async () => {
    await expect(
      writeFrontendSchema({ filePath: 'src/types.ts', content: '   \n   ' })
    ).rejects.toMatchObject({ code: 'WRITE_FAILED' });
  });

  it('throws FILE_NOT_ALLOWED for unlisted file', async () => {
    await expect(
      writeFrontendSchema({ filePath: 'package.json', content: '{}' })
    ).rejects.toMatchObject({ code: 'FILE_NOT_ALLOWED' });
  });

  it('throws FILE_TOO_LARGE when content exceeds 512 KB', async () => {
    const oversized = 'x'.repeat(512 * 1024 + 1);
    await expect(
      writeFrontendSchema({ filePath: 'src/types.ts', content: oversized })
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('leaves no .tmp file after a successful write', async () => {
    const content = `export interface User { uuid: string; }\n`;
    await writeFrontendSchema({ filePath: 'src/types.ts', content });
    const tmpFile = path.join(tmpDir, 'src', '.types.ts.tmp');
    expect(fs.existsSync(tmpFile)).toBe(false);
  });
});
