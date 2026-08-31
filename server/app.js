// Express application. Exported as a factory so tests can inject config.
//
// Security posture:
//  - Private endpoints require a Supabase Auth access token presented as an
//    `Authorization: Bearer …` header. The token is validated server-side on
//    EVERY request (constantly re-checked, never assumed).
//  - Authorization: only the single configured admin (ADMIN_USER_ID) is
//    allowed; any other verified user is denied.
//  - Fail closed: if the token can't be verified (expired/invalid) or Supabase
//    Auth is unreachable/misconfigured, access is denied (401 / 503) — never
//    allowed through.
//  - CORS only for the configured frontend origin(s), never "*". No cookies are
//    used, so CSRF is handled by the bearer-token model (browsers never attach
//    the token cross-site automatically).
//  - All sensitive responses are no-store.

import express from 'express';
import { loadConfig } from './lib/config.js';
import { createAuthValidator } from './lib/supauth.js';
import { createLeadsStore, VALID_STATUSES } from './lib/store.js';

export function createApp(overrides = {}) {
  const cfg = loadConfig(overrides);
  const auth = createAuthValidator(cfg);
  const store = createLeadsStore(cfg);

  const app = express();
  app.disable('x-powered-by');
  if (cfg.trustProxy) app.set('trust proxy', 1);

  app.use(express.json({ limit: '16kb' }));
  app.use(securityHeaders());
  app.use(corsMiddleware(cfg));

  const requireAdmin = makeRequireAdmin(auth, cfg);

  // --- Public ---
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // --- Session check (restores the authenticated view after a refresh) ---
  app.get('/api/session', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      authenticated: true,
      user: { id: req.user.id, email: req.user.email || '' },
    });
  });

  // --- Private leads API (server-side authorization on every request) ---
  app.get('/api/leads', requireAdmin, async (req, res) => {
    try {
      const leads = await store.list();
      res.set('Cache-Control', 'no-store');
      res.json({ leads });
    } catch (err) {
      console.error('leads.list failed', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.patch('/api/leads/:id', requireAdmin, async (req, res) => {
    const id = String(req.params.id ?? '');
    const status = String(req.body?.status ?? '');
    if (!id) return res.status(400).json({ error: 'bad_request' });
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'bad_request' });
    try {
      await store.update(id, { status });
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true });
    } catch (err) {
      console.error('leads.update failed', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.delete('/api/leads/:id', requireAdmin, async (req, res) => {
    const id = String(req.params.id ?? '');
    if (!id) return res.status(400).json({ error: 'bad_request' });
    try {
      await store.remove(id);
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true });
    } catch (err) {
      console.error('leads.remove failed', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  // --- 404 for unknown API routes ---
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  // Central error handler.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(400).json({ error: 'bad_request' });
    }
    console.error('unhandled error', err);
    res.status(500).json({ error: 'internal' });
  });

  return { app, auth, store, cfg };
}

function makeRequireAdmin(auth, cfg) {
  return async function requireAdmin(req, res, next) {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: 'unauthorized' });

    let user;
    try {
      user = await auth.getUser(token);
    } catch (_) {
      // Auth layer unavailable/misconfigured -> fail closed.
      return res.status(503).json({ error: 'auth_unavailable' });
    }

    if (!user) return res.status(401).json({ error: 'unauthorized' });

    // The identity comes from the verified token; client-supplied ids are
    // never consulted. Only the configured admin is authorized.
    if (!cfg.adminUserId || user.id !== cfg.adminUserId) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    req.user = user;
    next();
  };

  function bearerToken(req) {
    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : null;
  }
}

function securityHeaders() {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  return (req, res, next) => {
    res.set(headers);
    next();
  };
}

function corsMiddleware(cfg) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && cfg.frontendOrigins.includes(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
      });
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  };
}