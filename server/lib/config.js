// Server configuration. All values come from environment variables (.env).
// Nothing in this folder is ever shipped to the browser.

import 'dotenv/config';

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
};

const int = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

export function loadConfig(overrides = {}) {
  const env = process.env;
  const cfg = {
    port: int(overrides.port ?? env.PORT, 8787),
    env: overrides.env ?? env.NODE_ENV ?? 'development',

    frontendOrigins: normalizeOrigins(overrides.frontendOrigins ?? env.FRONTEND_ORIGINS ?? ''),

    trustProxy: bool(overrides.trustProxy ?? env.TRUST_PROXY, false),

    // Authorization: only this exact Supabase Auth user (the portfolio owner)
    // may use the private admin API. Copied from Supabase → Authentication →
    // Users → the admin user's UUID. Empty = fail closed (nobody is allowed).
    adminUserId: String(overrides.adminUserId ?? env.ADMIN_USER_ID ?? '').trim(),

    supabase: {
      url: overrides.supabaseUrl ?? env.SUPABASE_URL ?? '',
      serviceRoleKey: overrides.supabaseServiceRoleKey ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      leadsTable: overrides.supabaseLeadsTable ?? env.SUPABASE_LEADS_TABLE ?? 'leads',
      mock: bool(overrides.supabaseMock ?? env.SUPABASE_MOCK, false),
      authMock: bool(overrides.authMock ?? env.SUPABASE_AUTH_MOCK, false),
      mockAdminToken: overrides.mockAdminToken ?? env.AUTH_MOCK_ADMIN_TOKEN ?? 'dev-admin-token',
      mockUserToken: overrides.mockUserToken ?? env.AUTH_MOCK_USER_TOKEN ?? 'dev-user-token',
      mockAdminEmail: overrides.mockAdminEmail ?? env.AUTH_MOCK_ADMIN_EMAIL ?? 'admin@example.test',
      mockOtherEmail: overrides.mockOtherEmail ?? env.AUTH_MOCK_OTHER_EMAIL ?? 'other@example.test',
    },
  };

  cfg.frontendOrigins = cfg.frontendOrigins.length ? cfg.frontendOrigins : ['http://localhost:8080'];

  return cfg;
}

function normalizeOrigins(value) {
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw
    .map((s) => String(s).trim().replace(/\/+$/, ''))
    .filter(Boolean);
}