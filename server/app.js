// Express application. Exported as a factory so tests can inject config.
//
// Security posture:
//  - Private endpoints require a server-validated session (HttpOnly cookie).
//    Whether the user is allowed is re-confirmed against WordPress; if
//    WordPress is unreachable every protected request FAILS CLOSED (503).
//  - CORS only for the configured frontend origin(s), never "*".
//  - State-changing requests must come from an allowlisted Origin (CSRF).
//  - Login is rate limited; all sensitive responses are no-store.

import express from 'express';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { loadConfig } from './lib/config.js';
import { createSessionStore } from './lib/sessions.js';
import { createWordPressClient } from './lib/wp.js';
import { createLeadsStore, VALID_STATUSES } from './lib/store.js';

export function createApp(overrides = {}) {
  const cfg = loadConfig(overrides);

  const sessions = createSessionStore(cfg.session.ttlMs);
  const wp = createWordPressClient(cfg);
  const store = createLeadsStore(cfg);

  const app = express();
  app.disable('x-powered-by');
  if (cfg.trustProxy) app.set('trust proxy', 1);

  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());
  app.use(securityHeaders(cfg));
  app.use(corsMiddleware(cfg));
  app.use(csrfOriginGuard(cfg));

  // --- Login brute-force protection ---
  const loginLimiter = rateLimit({
    windowMs: cfg.login.windowMs,
    limit: cfg.login.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'rate_limited' }),
  });

  // --- Helpers ---
  const cookieOptions = () => ({
    httpOnly: true,
    secure: cfg.session.secure,
    sameSite: cfg.session.sameSite,
    path: '/',
    domain: cfg.session.domain,
  });

  function issueCookie(res, token) {
    res.cookie(cfg.session.cookieName, token, {
      ...cookieOptions(),
      maxAge: cfg.session.ttlMs,
    });
  }

  function clearCookie(res) {
    res.clearCookie(cfg.session.cookieName, cookieOptions());
  }

  const requireSession = makeRequireSession();

  function makeRequireSession() {
    return async function requireSession(req, res, next) {
      const token = req.cookies?.[cfg.session.cookieName];
      const session = token ? sessions.get(token) : null;
      if (!session) return res.status(401).json({ error: 'unauthorized' });

      const needsRecheck = Date.now() - session.lastValidatedAt >= cfg.wp.recheckMs;
      if (needsRecheck) {
        let check;
        try {
          check = await wp.checkUser(session.userId);
        } catch (err) {
          // Fail closed: cannot confirm authorization -> deny.
          return res.status(503).json({ error: 'auth_unavailable' });
        }
        if (!check.reachable) {
          // WordPress is unavailable. Never assume authenticity; deny access.
          return res.status(503).json({ error: 'auth_unavailable' });
        }
        if (!check.allowed) {
          sessions.destroy(token);
          clearCookie(res);
          return res.status(401).json({ error: 'unauthorized' });
        }
        session.lastValidatedAt = Date.now();
      }

      req.session = session;
      next();
    };
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // --- Login ---
  app.post('/api/login', loginLimiter, async (req, res) => {
    const login = String(req.body?.login ?? '').trim();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!login || !password) return res.status(400).json({ error: 'bad_request' });

    let result;
    try {
      result = await wp.authenticate(login, password);
    } catch (err) {
      return res.status(503).json({ error: 'auth_unavailable' });
    }

    if (!result.ok) {
      if (result.code === 'rate_limited') return res.status(429).json({ error: 'rate_limited' });
      if (result.code === 'unconfigured' || result.code === 'unreachable' || result.code === 'connector_failed') {
        // The auth layer itself is unavailable/misconfigured -> fail closed.
        return res.status(503).json({ error: 'auth_unavailable' });
      }
      // Generic on purpose: never reveal which field was wrong.
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const record = sessions.create({
      userId: result.user.id,
      displayName: result.user.display_name,
      email: result.user.email,
      validatedOnce: true,
    });
    record.lastValidatedAt = Date.now(); // credentials were just checked

    issueCookie(res, record.token);
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, user: { id: record.userId, display_name: result.user.display_name } });
  });

  // --- Logout ---
  app.post('/api/logout', (req, res) => {
    const token = req.cookies?.[cfg.session.cookieName];
    sessions.destroy(token);
    clearCookie(res);
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true });
  });

  // --- Session check ---
  app.get('/api/session', requireSession, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      authenticated: true,
      user: { id: req.session.userId, display_name: req.session.displayName, email: req.session.email },
    });
  });

  // --- Private leads API (server-side authorization on every request) ---
  app.get('/api/leads', requireSession, async (req, res) => {
    try {
      const leads = await store.list();
      res.set('Cache-Control', 'no-store');
      res.json({ leads });
    } catch (err) {
      console.error('leads.list failed', err);
      res.status(500).json({ error: 'internal' });
    }
  });

  app.patch('/api/leads/:id', requireSession, async (req, res) => {
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

  app.delete('/api/leads/:id', requireSession, async (req, res) => {
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

  return { app, wp, store, sessions, cfg };
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
        'Access-Control-Allow-Credentials': 'true',
        'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
      });
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  };
}

function csrfOriginGuard(cfg) {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    // State-changing requests must come from an allowlisted origin. Most
    // non-browser tools send no Origin header and are rejected here unless
    // they carry the HttpOnly cookie AND an explicit allowlisted Origin.
    let origin = req.headers.origin;
    if (!origin && req.headers.referer) {
      try {
        origin = new URL(req.headers.referer).origin;
      } catch (_) {
        origin = null;
      }
    }
    if (!origin || !cfg.frontendOrigins.includes(origin)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}