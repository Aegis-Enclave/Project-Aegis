# Repo A — Backend Mock API

Project Aegis demo backend. A minimal Node.js/Express/TypeScript API that serves a `User` object.

## Setup

```bash
npm install
npm run dev
```

## API

### `GET /api/user`

Returns the current user object:

```json
{
  "user_id": "u-001",
  "name": "Alice",
  "email": "alice@aegis.dev",
  "role": "admin"
}
```

## Data Contract

The `User` interface in `src/server.ts` defines the API response shape. The frontend (Repo B) mirrors this contract in `src/types.ts` and `src/schemas.ts`. **Project Aegis** automatically keeps Repo B in sync when this contract changes.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with ts-node |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server from `dist/` |

## Demo Breaking Change

During the demo, rename `user_id` → `uuid` in `src/server.ts` and open a PR. Project Aegis detects the change and automatically opens a synchronized PR on Repo B.
