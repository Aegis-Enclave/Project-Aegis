// src/lib/api.ts
import { UserSchema } from '../schemas';
import type { User } from '../types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Fetches the current user from the backend API.
 * Validates the response against the Zod schema for runtime type safety.
 */
export async function fetchUser(): Promise<User> {
  const response = await fetch(`${BACKEND_URL}/api/user`);

  if (!response.ok) {
    throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Runtime validation — catches contract mismatches that TypeScript can't detect at runtime
  const validated = UserSchema.parse(data);

  // Cast to our TypeScript interface type
  // (structurally identical to UserFromSchema, but we use the explicit interface for clarity)
  return validated as User;
}
