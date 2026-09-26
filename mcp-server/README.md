# MCP Context Bridge Server

The **Aegis MCP Context Bridge** is a custom Model Context Protocol (MCP) server that provides IBM Bob 2.0 with secure, scoped filesystem tools to read and write the frontend repository's TypeScript type files.

## Architecture

```
Bob 2.0 Shell (stdio) ◄──► aegis-mcp-server ◄──► ./repo-b/src/types.ts
                                                ◄──► ./repo-b/src/schemas.ts
```

## Tools

### `read_frontend_schema`
Reads a TypeScript type definition or Zod schema file from the local Repo B clone.

**Input:**
```json
{ "filePath": "src/types.ts" }
```
or
```json
{ "filePath": "src/schemas.ts" }
```

**Output:**
```json
{
  "filePath": "src/types.ts",
  "content": "...",
  "lineCount": 12,
  "sizeBytes": 340
}
```

### `write_frontend_schema`
Overwrites a frontend type/schema file with new content. **Full overwrite only** — provide the complete file content.

**Input:**
```json
{
  "filePath": "src/types.ts",
  "content": "export interface User { uuid: string; ... }"
}
```

**Output:**
```json
{
  "filePath": "src/types.ts",
  "bytesWritten": 340,
  "lineCount": 12,
  "success": true
}
```

## Security

- **Allowlist:** Only `src/types.ts` and `src/schemas.ts` are accessible.
- **Path traversal prevention:** All paths are validated against the `REPO_B_PATH` boundary.
- **No arbitrary file access:** Any request for an unlisted path returns `FILE_NOT_ALLOWED`.

## Setup

```bash
npm install
npm run build
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REPO_B_PATH` | `./repo-b` | Path to the local clone of Repo B |

## Running

```bash
# Development (ts-node)
npm run dev

# Production (compiled)
npm start
```

## Tests

```bash
npm test
```
