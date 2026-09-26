// src/schemas.ts
//
// Zod runtime validation schema for the User entity.
// Provides runtime type safety on top of TypeScript's compile-time checks.
// MUST stay in sync with the TypeScript interface in types.ts.

import { z } from 'zod';

export const UserSchema = z.object({
  user_id: z.string(),                              // Matches User.user_id
  name: z.string(),                                 // Matches User.name
  email: z.string().email(),                        // Matches User.email (with email validation)
  role: z.enum(['admin', 'member', 'viewer']),      // Matches User.role
});

// Inferred type — should be structurally identical to the User interface in types.ts
export type UserFromSchema = z.infer<typeof UserSchema>;
