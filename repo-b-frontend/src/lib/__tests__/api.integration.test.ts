// src/lib/__tests__/api.integration.test.ts
//
// Integration tests for fetchUser against a real Express server.
// The backend app is imported directly from repo-a-backend and started on a
// random free port. Tests exercise the full stack: HTTP → JSON → Zod parse.

import http from 'http';
// Cross-package import resolved via moduleNameMapper in jest.config.ts
import { app } from '../../../../repo-a-backend/src/server';

let server: http.Server;
let baseUrl: string;

beforeAll((done) => {
  server = app.listen(0, () => {
    const addr = server.address() as { port: number };
    baseUrl = `http://localhost:${addr.port}`;
    process.env.NEXT_PUBLIC_BACKEND_URL = baseUrl;
    done();
  });
});

afterAll((done) => {
  server.close(done);
  delete process.env.NEXT_PUBLIC_BACKEND_URL;
});

// ---------------------------------------------------------------------------
// fetchUser — happy path
// ---------------------------------------------------------------------------

describe('fetchUser (integration)', () => {
  it('fetches a fully-typed, Zod-validated User from the live server', async () => {
    // Dynamic import so NEXT_PUBLIC_BACKEND_URL is read after it is set in beforeAll
    const { fetchUser } = await import('../api');
    const user = await fetchUser();

    expect(user).toMatchObject({
      user_id: expect.any(String),
      name: expect.any(String),
      email: expect.any(String),
      role: expect.stringMatching(/^(admin|member|viewer)$/),
    });
    // Confirm no extra fields are present (strict schema)
    expect(Object.keys(user).sort()).toEqual(['email', 'name', 'role', 'user_id']);
  });

  // ---------------------------------------------------------------------------
  // Schema violation — backend returns unexpected fields
  // ---------------------------------------------------------------------------

  it('throws ZodError when the backend returns a schema-violating response', async () => {
    const { ZodError } = await import('zod');
    const { fetchUser: freshFetchUser } = await import('../api');

    // Temporarily monkey-patch the route to return an extra unknown field
    const routerStack = (app as any)._router?.stack as Array<{
      route?: { path: string; stack: Array<{ handle: (...args: unknown[]) => void }> };
    }>;
    const userRoute = routerStack.find((layer) => layer.route?.path === '/api/user');
    if (!userRoute?.route) {
      throw new Error('Could not locate /api/user route for monkey-patching');
    }

    const originalHandler = userRoute.route.stack[0].handle;
    // Inject an extra field that .strict() will reject
    userRoute.route.stack[0].handle = (_req: unknown, res: any) => {
      res.json({ user_id: 'u-001', name: 'Alice', email: 'alice@aegis.dev', role: 'admin', extra: 'boom' });
    };

    try {
      await expect(freshFetchUser()).rejects.toBeInstanceOf(ZodError);
    } finally {
      // Restore original handler
      userRoute.route.stack[0].handle = originalHandler;
    }
  });

  // ---------------------------------------------------------------------------
  // Server closed — retries fire then throw
  // ---------------------------------------------------------------------------

  it('retries and eventually throws when the server is closed mid-test', async () => {
    // Close the main server to simulate unavailability
    await new Promise<void>((resolve) => server.close(() => resolve()));

    const { fetchUser: freshFetchUser } = await import('../api');

    await expect(
      // Use short timeouts to keep the test fast
      freshFetchUser()
    ).rejects.toThrow(/Backend API unreachable/);

    // Reopen the server for cleanup
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        process.env.NEXT_PUBLIC_BACKEND_URL = baseUrl;
        resolve();
      });
    });
  });
});
