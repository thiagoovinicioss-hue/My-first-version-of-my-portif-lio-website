// Supabase Auth validator — the ONLY component that verifies client access
// tokens server-side.
//
// Real mode: calls Supabase Auth (go_true) with the SERVICE ROLE client. The
// authenticated user is derived from the verified token ONLY — a user id sent
// in the request body is never trusted. Invalid/expired tokens resolve to
// `null` (deny); anything that prevents validation (network/config) throws so
// the caller fails closed.
//
// Mock mode (SUPABASE_AUTH_MOCK=1, dev/tests only): a built-in fake that
// accepts two well-known tokens so the flow works without a Supabase project.

import { createClient } from '@supabase/supabase-js';

export function createAuthValidator(cfg) {
  if (cfg.supabase.authMock) return createMockValidator(cfg);
  return createRealValidator(cfg);
}

function createRealValidator(cfg) {
  const ready = Boolean(cfg.supabase.url && cfg.supabase.serviceRoleKey);
  const db = ready
    ? createClient(cfg.supabase.url, cfg.supabase.serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  return {
    ready,
    async getUser(token) {
      if (!token) return null;
      if (!ready) throw new Error('auth_unconfigured');

      let result;
      try {
        result = await db.auth.getUser(token);
      } catch (err) {
        // Network failure / auth service unreachable -> caller fails closed.
        if (err?.status === 401 || err?.status === 403) return null;
        console.error('[supauth] getUser unavailable:', err?.message || err);
        throw err;
      }

      if (result.error) {
        if (result.error.status === 401 || result.error.status === 403) return null; // invalid/expired token
        console.error('[supauth] getUser error:', result.error.message);
        throw result.error;
      }
      return result.data?.user ?? null;
    },
  };
}

function createMockValidator(cfg) {
  const adminId = cfg.adminUserId || 'mock-admin';
  return {
    ready: true,
    async getUser(token) {
      if (!token) return null;
      if (token === cfg.supabase.mockAdminToken) {
        return { id: adminId, email: cfg.supabase.mockAdminEmail, app_metadata: {}, user_metadata: {} };
      }
      if (token === cfg.supabase.mockUserToken) {
        return { id: 'mock-other-user', email: cfg.supabase.mockOtherEmail, app_metadata: {}, user_metadata: {} };
      }
      return null;
    },
  };
}