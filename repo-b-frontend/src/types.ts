// src/types.ts
//
// Frontend data contract for the User entity.
// This interface MUST match the backend API response shape (Repo A: GET /api/user).
// Project Aegis automatically keeps this in sync when the backend changes.

export interface User {
  user_id: string;    // Unique user identifier — matches backend field name
  name: string;       // User's display name
  email: string;      // User's email address
  role: 'admin' | 'member' | 'viewer';  // User's permission level
}
