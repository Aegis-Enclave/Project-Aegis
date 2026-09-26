// src/server.ts
import express, { Request, Response } from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

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

app.listen(PORT, () => {
  console.log(`[Repo A] Backend API running on http://localhost:${PORT}`);
});
