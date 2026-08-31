// DEV-ONLY standalone mock of the TV Portfolio Auth WordPress plugin.
//
// Implements the exact REST contract that the real plugin ships
// (see wp/tv-portfolio-auth/tv-portfolio-auth.php). It lets you point
// WORDPRESS_URL at http://localhost:8788 and run the backend against a full
// HTTP transport (Basic auth, JSON bodies, status codes) without installing
// WordPress. NEVER deploy this anywhere.
//
// Usage:
//   MOCK_WP_CONNECT_USER=admin MOCK_WP_CONNECT_PASS=apppass \
//   MOCK_WP_USER=admin MOCK_WP_PASSWORD=secret node scripts/mock-wp.js [port]

import http from 'node:http';

const PORT = process.env.MOCK_WP_PORT ? Number(process.env.MOCK_WP_PORT) : 8788;
const CONNECT_USER = process.env.MOCK_WP_CONNECT_USER || 'admin';
const CONNECT_PASS = process.env.MOCK_WP_CONNECT_PASS || 'apppass';
const WP_USER = process.env.MOCK_WP_USER || 'admin';
const WP_PASS = process.env.MOCK_WP_PASSWORD || 'secret';
const WP_USER_ID = Number(process.env.MOCK_WP_USER_ID || 1);

const NS = '/wp-json/tv-portfolio-auth/v1';

function readJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (_) { resolve({}); }
    });
  });
}

function send(res, status, json) {
  const payload = Buffer.from(JSON.stringify(json));
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function authMatches(req) {
  const header = req.headers.authorization || '';
  const expected = `Basic ${Buffer.from(`${CONNECT_USER}:${CONNECT_PASS}`).toString('base64')}`;
  // Constant-time comparison for the mock.
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  if (!authMatches(req)) {
    return send(res, 401, { code: 'rest_forbidden', message: 'Sorry, you are not allowed to do that.', data: { status: 401 } });
  }

  if (req.method === 'POST' && path === `${NS}/authenticate`) {
    const body = await readJson(req);
    if (body.login === WP_USER && body.password === WP_PASS) {
      return send(res, 200, { user_id: WP_USER_ID, display_name: 'Dev Admin', user_email: 'dev@example.test' });
    }
    return send(res, 401, { code: 'tv_portfolio_auth_invalid_credentials', message: 'Invalid credentials.', data: { status: 401 } });
  }

  if (req.method === 'GET' && path === `${NS}/check-user`) {
    const userId = Number(url.searchParams.get('user_id') || 0);
    return send(res, 200, { allowed: userId === WP_USER_ID });
  }

  send(res, 404, { code: 'rest_no_route', message: 'No route was found matching the URL and request method.' });
});

server.listen(PORT, () => {
  console.log(`[mock-wp] listening on :${PORT}`);
  console.log(`[mock-wp] connect  -> ${CONNECT_USER} / ${CONNECT_PASS}`);
  console.log(`[mock-wp] user     -> ${WP_USER} / ${WP_PASS}`);
});