#!/usr/bin/env node
// src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFrontendSchema } from './tools/readFrontendSchema.js';
import { writeFrontendSchema } from './tools/writeFrontendSchema.js';
import { SERVER_NAME, SERVER_VERSION, getRepoBBasePath, getAllowedFiles } from './config.js';
import { McpToolError } from './validation.js';

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

// ─── Tool: read_frontend_schema ───────────────────────────────────
server.registerTool(
  'read_frontend_schema',
  {
    description:
      "Reads a TypeScript type definition file or Zod schema file from the frontend repository (Repo B). Use this tool to understand the current frontend data contracts before making changes. Returns the complete file content along with metadata.",
    inputSchema: z.object({
      filePath: z
        .enum(['src/types.ts', 'src/schemas.ts'])
        .describe(
          "Relative path to the file within the frontend repo. Allowed values: 'src/types.ts' (TypeScript interfaces) or 'src/schemas.ts' (Zod validation schemas)."
        ),
    }),
  },
  async ({ filePath }) => {
    try {
      const result = await readFrontendSchema({ filePath });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      if (err instanceof McpToolError) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: true, code: err.code, message: err.message }),
            },
          ],
          isError: true,
        };
      }
      throw err;
    }
  }
);

// ─── Tool: write_frontend_schema ──────────────────────────────────
server.registerTool(
  'write_frontend_schema',
  {
    description:
      "Overwrites a TypeScript type definition file or Zod schema file in the frontend repository (Repo B). Use this tool after generating updated code that matches the new backend API contract. WARNING: This performs a FULL OVERWRITE of the file — you must provide the complete new file content, not just a diff or patch.",
    inputSchema: z.object({
      filePath: z
        .enum(['src/types.ts', 'src/schemas.ts'])
        .describe(
          "Relative path to the file within the frontend repo. Allowed values: 'src/types.ts' (TypeScript interfaces) or 'src/schemas.ts' (Zod validation schemas)."
        ),
      content: z
        .string()
        .describe(
          'The complete new file content to write. Must be valid TypeScript code. Include all imports, exports, comments, and type definitions.'
        ),
    }),
  },
  async ({ filePath, content }) => {
    try {
      const result = await writeFrontendSchema({ filePath, content });
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      if (err instanceof McpToolError) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: true, code: err.code, message: err.message }),
            },
          ],
          isError: true,
        };
      }
      throw err;
    }
  }
);

// ─── Start server ─────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[Aegis MCP] Context Bridge server started (stdio transport)`);
  console.error(`[Aegis MCP] Server: ${SERVER_NAME} v${SERVER_VERSION}`);
  console.error(`[Aegis MCP] Repo B path: ${getRepoBBasePath()}`);
  console.error(`[Aegis MCP] Allowed files: ${getAllowedFiles().join(', ')}`);
  console.error(`[Aegis MCP] Tools: read_frontend_schema, write_frontend_schema`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
