# Repo B — Frontend Application

Project Aegis demo frontend. A Next.js/TypeScript application that displays user data from the backend API.

## Setup

```bash
npm install
npm run dev
```

The frontend connects to `http://localhost:3001` by default. Set `NEXT_PUBLIC_BACKEND_URL` to override.

## Key Files

| File | Purpose |
|------|---------|
| `src/types.ts` | TypeScript interface defining the User data contract |
| `src/schemas.ts` | Zod runtime validation schema (mirrors `types.ts`) |
| `src/lib/api.ts` | Fetch utility with Zod validation |
| `src/app/page.tsx` | Main display component |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Production build |
| `npm run type-check` | Run `tsc --noEmit` — used by Project Aegis Critic agent |

## Contract Synchronization

The `src/types.ts` and `src/schemas.ts` files are automatically kept in sync with the backend API contract by **Project Aegis**. When a breaking change is detected in Repo A, Aegis opens a PR on this repository with the updated types.
