// Server-side session store.
//
// Sessions live only on the server; the browser holds an opaque random token
// in an HttpOnly cookie. There is no client-visible session content and no
// way for frontend code to forge or read it.

import crypto from 'node:crypto';

export function createSessionStore(ttlMs) {
  const sessions = new Map();

  function create(session) {
    const token = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const record = {
      ...session,
      token,
      createdAt: now,
      expiresAt: now + ttlMs,
      lastValidatedAt: 0,
    };
    sessions.set(token, record);
    return record;
  }

  function get(token) {
    if (!token) return null;
    const record = sessions.get(token);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      sessions.delete(token);
      return null;
    }
    return record;
  }

  function destroy(token) {
    if (token) sessions.delete(token);
  }

  return { create, get, destroy };
}