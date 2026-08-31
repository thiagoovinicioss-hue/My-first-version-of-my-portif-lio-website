// Integration tests for the portfolio auth backend.
// Runs against the real Express app with in-memory WordPress + leads mocks,
// covering the required unauthenticated / authenticated / authorization /
// session / logout / fail-closed / CSRF / rate-limit scenarios.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../app.js';

const ALLOWED_ORIGIN = 'http://localhost:8080';

async function withApp(overrides, fn) {
  const ctx = createApp(overrides);
  const server = ctx.app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn({ baseUrl, ...ctx });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function extractToken(setCookie) {
  const match = /tv_session=([^;]+)/.exec(setCookie || '');
  return match ? match[1] : null;
}

async function request(baseUrl, path, { method = 'GET', body, headers = {}, cookie, origin } = {}) {
  const h = { ...headers };
  if (origin) h.Origin = origin;
  if (cookie) h.Cookie = `tv_session=${cookie}`;
  const opts = { method, headers: h };
  if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* no body */ }
  return { status: res.status, data, setCookie: res.headers.get('set-cookie'), headers: res.headers };
}

const baseOverrides = {
  env: 'test',
  frontendOrigins: [ALLOWED_ORIGIN],
  wpMock: true,
  wpMockUser: 'th_admin',
  wpMockPassword: 'correct horse battery staple',
  supabaseMock: true,
  cookieSecure: false, // allow plain-HTTP test transport; HttpOnly flags still asserted
  sessionTtlMs: 60_000,
  loginWindowMs: 10_000,
  loginMaxAttempts: 4,
};

async function login(baseUrl, login = 'th_admin', password = 'correct horse battery staple') {
  return request(baseUrl, '/api/login', {
    method: 'POST',
    origin: ALLOWED_ORIGIN,
    body: { login, password },
  });
}

describe('public endpoints', () => {
  test('health is reachable without authentication', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      const res = await request(baseUrl, '/api/health');
      assert.equal(res.status, 200);
      assert.deepEqual(res.data, { ok: true });
    });
  });

  test('unknown api route returns 404 JSON', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      const res = await request(baseUrl, '/api/nope');
      assert.equal(res.status, 404);
    });
  });
});

describe('unauthenticated access is denied', () => {
  test('GET /api/session without cookie -> 401', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      const res = await request(baseUrl, '/api/session');
      assert.equal(res.status, 401);
      assert.equal(res.data.error, 'unauthorized');
    });
  });

  test('GET /api/leads without cookie -> 401', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      const res = await request(baseUrl, '/api/leads');
      assert.equal(res.status, 401);
    });
  });

  test('PATCH/DELETE /api/leads/:id without session -> 401', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      const patch = await request(baseUrl, '/api/leads/abc', { method: 'PATCH', origin: ALLOWED_ORIGIN, body: { status: 'won' } });
      assert.equal(patch.status, 401);
      const del = await request(baseUrl, '/api/leads/abc', { method: 'DELETE', origin: ALLOWED_ORIGIN });
      assert.equal(del.status, 401);
    });
  });

  test('state-changing requests from a foreign origin -> 403 (CSRF)', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      const res = await request(baseUrl, '/api/login', {
        method: 'POST',
        origin: 'https://evil.example',
        body: { login: 'x', password: 'y' },
      });
      assert.equal(res.status, 403);
    });
  });
});

describe('login', () => {
  test('rejects invalid credentials with a generic error', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      const res = await login(baseUrl, 'th_admin', 'wrong-password');
      assert.equal(res.status, 401);
      assert.equal(res.data.error, 'invalid_credentials');
    });
  });

  test('rejects unknown users with the exact same generic error', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      const res = await login(baseUrl, 'does-not-exist', 'any-password');
      assert.equal(res.status, 401);
      assert.equal(res.data.error, 'invalid_credentials');
    });
  });

  test('rejects empty fields -> 400', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      const res = await login(baseUrl, '', '');
      assert.equal(res.status, 400);
    });
  });

  test('issues an HttpOnly session cookie on success', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      const res = await login(baseUrl);
      assert.equal(res.status, 200);
      assert.ok(res.setCookie, 'expected a Set-Cookie header');
      assert.match(res.setCookie, /tv_session=[0-9a-f]{64}/);
      assert.match(res.setCookie, /HttpOnly/i);
    });
  });

  test('cookie is SameSite-aware and Secure-flagged when configured', async () => {
    await withApp({ ...baseOverrides, cookieSecure: true }, async ({ baseUrl }) => {
      const res = await login(baseUrl);
      assert.match(res.setCookie, /Secure/i);
      assert.match(res.setCookie, /SameSite=None/i);
    });
  });

  test('rate limits repeated attempts -> 429', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      let finalStatus = 0;
      for (let i = 0; i < 6; i++) {
        const res = await login(baseUrl, 'th_admin', `guess-${i}`);
        finalStatus = res.status;
      }
      assert.equal(finalStatus, 429);
      assert.equal((await login(baseUrl)).status, 429);
    });
  });
});

describe('authenticated flow', () => {
  test('login -> session -> leads -> update -> delete', async () => {
    await withApp(baseOverrides, async ({ baseUrl, store }) => {
      const lead = store.seed({ name: 'Ada Lovelace', status: 'new' });

      const loginRes = await login(baseUrl);
      assert.equal(loginRes.status, 200);
      const token = extractToken(loginRes.setCookie);
      assert.ok(token);

      const session = await request(baseUrl, '/api/session', { cookie: token });
      assert.equal(session.status, 200);
      assert.equal(session.data.authenticated, true);
      assert.equal(session.data.user.id, '1');

      const leads = await request(baseUrl, '/api/leads', { cookie: token });
      assert.equal(leads.status, 200);
      assert.equal(leads.data.leads.length, 1);
      assert.equal(leads.data.leads[0].id, lead.id);
      assert.equal(leads.data.leads[0].status, 'new');

      const patch = await request(baseUrl, `/api/leads/${lead.id}`, { method: 'PATCH', origin: ALLOWED_ORIGIN, cookie: token, body: { status: 'won' } });
      assert.equal(patch.status, 200);

      const after = await request(baseUrl, '/api/leads', { cookie: token });
      assert.equal(after.data.leads[0].status, 'won');

      const del = await request(baseUrl, `/api/leads/${lead.id}`, { method: 'DELETE', origin: ALLOWED_ORIGIN, cookie: token });
      assert.equal(del.status, 200);

      const empty = await request(baseUrl, '/api/leads', { cookie: token });
      assert.equal(empty.data.leads.length, 0);
    });
  });

  test('private responses are served as no-store', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      const loginRes = await login(baseUrl);
      const token = extractToken(loginRes.setCookie);
      const session = await request(baseUrl, '/api/session', { cookie: token });
      assert.match(session.headers.get('cache-control'), /no-store/i);
      const leads = await request(baseUrl, '/api/leads', { cookie: token });
      assert.match(leads.headers.get('cache-control'), /no-store/i);
    });
  });

  test('invalid status is rejected -> 400', async () => {
    await withApp(baseOverrides, async ({ baseUrl, store }) => {
      const lead = store.seed({ name: 'X' });
      const loginRes = await login(baseUrl);
      const token = extractToken(loginRes.setCookie);
      const patch = await request(baseUrl, `/api/leads/${lead.id}`, { method: 'PATCH', origin: ALLOWED_ORIGIN, cookie: token, body: { status: 'bogus' } });
      assert.equal(patch.status, 400);
    });
  });

  test('logout invalidates the session and cookie', async () => {
    await withApp(baseOverrides, async ({ baseUrl }) => {
      const loginRes = await login(baseUrl);
      const token = extractToken(loginRes.setCookie);
      assert.ok(token);

      const out = await request(baseUrl, '/api/logout', { method: 'POST', origin: ALLOWED_ORIGIN, cookie: token });
      assert.equal(out.status, 200);

      const session = await request(baseUrl, '/api/session', { cookie: token });
      assert.equal(session.status, 401);
      const leads = await request(baseUrl, '/api/leads', { cookie: token });
      assert.equal(leads.status, 401);
    });
  });
});

describe('authorization (capability) via session revalidation', () => {
  test('user losing the capability is logged out on next recheck', async () => {
    await withApp(baseOverrides, async ({ baseUrl, wp, sessions }) => {
      const loginRes = await login(baseUrl);
      const token = extractToken(loginRes.setCookie);
      assert.ok(token);

      const ok = await request(baseUrl, '/api/session', { cookie: token });
      assert.equal(ok.status, 200);

      // Instrument: expire revalidation window and revoke the capability.
      const record = sessions.get(token);
      record.lastValidatedAt = 0;
      wp.checkUser = async () => ({ reachable: true, allowed: false });

      const denied = await request(baseUrl, '/api/session', { cookie: token });
      assert.equal(denied.status, 401);
      assert.equal(denied.data.error, 'unauthorized');

      const leads = await request(baseUrl, '/api/leads', { cookie: token });
      assert.equal(leads.status, 401);
    });
  });

  test('WordPress unreachable fails closed (503) even with a valid cookie', async () => {
    await withApp(baseOverrides, async ({ baseUrl, wp, sessions }) => {
      const loginRes = await login(baseUrl);
      const token = extractToken(loginRes.setCookie);
      assert.ok(token);
      const record = sessions.get(token);
      record.lastValidatedAt = 0;

      wp.checkUser = async () => ({ reachable: false, allowed: false });

      const session = await request(baseUrl, '/api/session', { cookie: token });
      assert.equal(session.status, 503);
      assert.equal(session.data.error, 'auth_unavailable');

      const leads = await request(baseUrl, '/api/leads', { cookie: token });
      assert.equal(leads.status, 503);
    });
  });
});

describe('fail-closed without a configured WordPress', () => {
  test('login returns 503 (auth unavailable) when WordPress is not reachable', async () => {
    await withApp({ ...baseOverrides, wpMock: false, wpBaseUrl: '', supabaseMock: true }, async ({ baseUrl }) => {
      const res = await login(baseUrl, 'any', 'any');
      assert.equal(res.status, 503);
      assert.equal(res.data.error, 'auth_unavailable');
    });
  });

  test('an existing session fails closed when WordPress is gone', async () => {
    await withApp({ ...baseOverrides, wpMock: false, wpBaseUrl: '', supabaseMock: true }, async ({ baseUrl, sessions }) => {
      // A session that predates the WordPress outage.
      const record = sessions.create({ userId: '1', displayName: 'X' });
      record.lastValidatedAt = 0;
      const session = await request(baseUrl, '/api/session', { cookie: record.token });
      assert.equal(session.status, 503);
      const leads = await request(baseUrl, '/api/leads', { cookie: record.token });
      assert.equal(leads.status, 503);
    });
  });
});

// --- Real HTTP transport against the dev-only mock WordPress server ---

describe('real WordPress REST client (http transport)', () => {
  let proc;
  let mockBase;
  const dir = mkdtempSync(join(tmpdir(), 'tv-mock-wp-'));

  before(async () => {
    mockBase = `http://127.0.0.1:${8700 + Math.floor(Math.random() * 500)}`;
    const port = new URL(mockBase).port;
    proc = spawn(process.execPath, [join(import.meta.dirname, '../scripts/mock-wp.js'), String(port)], {
      env: {
        ...process.env,
        MOCK_WP_PORT: port,
        MOCK_WP_CONNECT_USER: 'connect',
        MOCK_WP_CONNECT_PASS: 'app-pass-123',
        MOCK_WP_USER: 'pvt_admin',
        MOCK_WP_PASSWORD: 'super-secret',
        MOCK_WP_USER_ID: '42',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    proc.unref();
    await new Promise((resolve, reject) => {
      proc.stdout.on('data', (d) => { if (/listening/.test(String(d))) resolve(); });
      proc.once('exit', () => reject(new Error('mock-wp exited early')));
      proc.once('error', reject);
      setTimeout(resolve, 800); // fallback
    });
  });

  after(() => {
    if (proc && !proc.killed) proc.kill('SIGTERM');
  });

  const realOverrides = () => ({
    env: 'test',
    frontendOrigins: [ALLOWED_ORIGIN],
    wpMock: false,
    wpBaseUrl: mockBase,
    wpConnectUser: 'connect',
    wpConnectAppPassword: 'app-pass-123',
    supabaseMock: true,
    cookieSecure: false,
  });

  test('authenticates through the real HTTP API with connector Basic auth', async () => {
    await withApp(realOverrides(), async ({ baseUrl }) => {
      const ok = await login(baseUrl, 'pvt_admin', 'super-secret');
      assert.equal(ok.status, 200);
      assert.ok(extractToken(ok.setCookie));
    });
  });

  test('wrong connector credentials produce a fail-closed 503', async () => {
    await withApp({ ...realOverrides(), wpConnectAppPassword: 'wrong' }, async ({ baseUrl }) => {
      const res = await login(baseUrl, 'pvt_admin', 'super-secret');
      assert.equal(res.status, 503);
    });
  });

  test('check-user revalidation works over the real HTTP API', async () => {
    await withApp(realOverrides(), async ({ baseUrl, sessions }) => {
      const record = sessions.create({ userId: '42', displayName: 'X' });
      record.lastValidatedAt = 0;
      const session = await request(baseUrl, '/api/session', { cookie: record.token });
      assert.equal(session.status, 200);
      assert.equal(session.data.authenticated, true);
    });
  });
});