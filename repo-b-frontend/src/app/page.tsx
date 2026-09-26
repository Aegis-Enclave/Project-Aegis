// src/app/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { fetchUser } from '../lib/api';
import type { User } from '../types';

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUser()
      .then(setUser)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div>Error: {error}</div>;
  if (!user) return <div>Loading...</div>;

  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>Project Aegis — Frontend</h1>
      <h2>User Data (from Backend API)</h2>
      <table style={{ borderCollapse: 'collapse', marginTop: '1rem' }}>
        <tbody>
          <tr><td><strong>user_id</strong></td><td>{user.user_id}</td></tr>
          <tr><td><strong>name</strong></td><td>{user.name}</td></tr>
          <tr><td><strong>email</strong></td><td>{user.email}</td></tr>
          <tr><td><strong>role</strong></td><td>{user.role}</td></tr>
        </tbody>
      </table>
    </main>
  );
}
