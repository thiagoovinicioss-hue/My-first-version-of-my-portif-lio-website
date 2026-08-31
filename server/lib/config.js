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

    wp: {
      baseUrl: String(overrides.wpBaseUrl ?? env.WORDPRESS_URL ?? '').replace(/\/+$/, ''),
      connectUser: overrides.wpConnectUser ?? env.WORDPRESS_CONNECT_USER ?? '',
      connectAppPassword: overrides.wpConnectAppPassword ?? env.WORDPRESS_CONNECT_APP_PASSWORD ?? '',
      recheckMs: int(overrides.wpRecheckMs ?? env.WP_RECHECK_MS, 10 * 60 * 1000),
      timeoutMs: int(overrides.wpTimeoutMs ?? env.WP_TIMEOUT_MS, 8000),
      mock: bool(overrides.wpMock ?? env.WP_MOCK, false),
      mockUser: overrides.wpMockUser ?? env.WP_MOCK_USER ?? 'admin',
      mockPassword: overrides.wpMockPassword ?? env.WP_MOCK_PASSWORD ?? '',
      mockUserId: int(overrides.wpMockUserId ?? env.WP_MOCK_USER_ID, 1),
    },

    supabase: {
      url: overrides.supabaseUrl ?? env.SUPABASE_URL ?? '',
      serviceRoleKey: overrides.supabaseServiceRoleKey ?? env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      leadsTable: overrides.supabaseLeadsTable ?? env.SUPABASE_LEADS_TABLE ?? 'leads',
      mock: bool(overrides.supabaseMock ?? env.SUPABASE_MOCK, false),
    },

    session: {
      ttlMs: int(overrides.sessionTtlMs ?? env.SESSION_TTL_MS, 8 * 60 * 60 * 1000),
      cookieName: overrides.sessionCookie ?? env.SESSION_COOKIE ?? 'tv_session',
      sameSite: overrides.cookieSameSite ?? env.COOKIE_SAMESITE ?? 'None',
      secure: bool(overrides.cookieSecure ?? env.COOKIE_SECURE, true),
      domain: overrides.cookieDomain ?? env.COOKIE_DOMAIN ?? undefined,
    },

    login: {
      windowMs: int(overrides.loginWindowMs ?? env.LOGIN_WINDOW_MS, 15 * 60 * 1000),
      max: int(overrides.loginMaxAttempts ?? env.LOGIN_MAX_ATTEMPTS, 8),
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