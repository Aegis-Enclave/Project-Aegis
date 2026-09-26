// src/server.ts
import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

// Allow cross-origin requests from the frontend (e.g. Next.js on port 3000).
// Override the allowed origin via CORS_ORIGIN env var in production.
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

// ───────────────────────────────────────────────
// Data Contract: User
// This interface defines the API response shape.
// The frontend (Repo B) depends on this contract.
// ───────────────────────────────────────────────
interface User {
  user_id: string;    // ← THIS FIELD will be renamed to `uuid` in the demo
  name: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
}

// GET /api/user — Returns a single user object
app.get('/api/user', (_req: Request, res: Response) => {
  const user: User = {
    user_id: 'u-001',
    name: 'Alice',
    email: 'alice@aegis.dev',
    role: 'admin',
  };
  res.json(user);
});

// Export app for integration tests — tests import this and call app.listen(0)
// to bind a random port without starting a permanent server.
export { app };

// Only start listening when run directly (not imported by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Repo A] Backend API running on http://localhost:${PORT}`);
  });
}
