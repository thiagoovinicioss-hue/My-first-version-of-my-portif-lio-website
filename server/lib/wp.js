// WordPress client — the ONLY component that talks to WordPress.
//
// Real mode: calls the TV Portfolio Auth plugin's REST endpoints using the
// connector account's Application Password (HTTP Basic auth).
// Mock mode (WP_MOCK=1, dev/tests only): a built-in fake that faithfully
// mimics the plugin's contract so the flow can be exercised without a running
// WordPress install.

const NAMESPACE = '/wp-json/tv-portfolio-auth/v1';

/**
 * @param {import('./config.js').config} cfg
 */
export function createWordPressClient(cfg) {
  if (cfg.wp.mock) {
    return createMockClient(cfg);
  }
  return createRealClient(cfg);
}

function createRealClient(cfg) {
  const baseUrl = cfg.wp.baseUrl;
  const credentialsConfigured = Boolean(cfg.wp.connectUser && cfg.wp.connectAppPassword);

  async function call(endpoint, { method = 'GET', body, timeout = cfg.wp.timeoutMs } = {}) {
    if (!baseUrl) {
      return { fatal: true, code: 'unconfigured' };
    }
    const url = `${baseUrl}${NAMESPACE}/${endpoint}`;
    const headers = { Accept: 'application/json' };
    if (credentialsConfigured) {
      const token = Buffer.from(`${cfg.wp.connectUser}:${cfg.wp.connectAppPassword}`).toString('base64');
      headers.Authorization = `Basic ${token}`;
    }
    const init = { method, headers, redirect: 'error', signal: AbortSignal.timeout(timeout) };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      console.error(`[wp] ${endpoint} unreachable:`, err?.message || err);
      return { fatal: true, code: 'unreachable', error: String(err?.message || err) };
    }

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      /* non-JSON body — treat as failure below */
    }

    if (!response.ok) {
      if (response.status === 429) {
        return { status: 429, ok: false, data };
      }
      return { fatal: false, status: response.status, ok: false, data };
    }

    return { status: response.status, ok: true, data: data || {} };
  }

  /**
   * Validate credentials against WordPress. Always the same outcome shape so
   * the caller can never tell "user doesn't exist" from "wrong password".
   */
  async function authenticate(login, password) {
    const result = await call('authenticate', { method: 'POST', body: { login, password } });
    if (result.fatal) return { ok: false, code: result.code };
    if (!result.ok) {
      if (result.status === 429) return { ok: false, code: 'rate_limited' };
      // A non-401 response, or a 401 that is NOT the plugin's generic
      // "invalid credentials" (e.g. rest_forbidden), means the connector
      // account itself is misconfigured -> fail closed.
      if (
        result.status !== 401 ||
        result.data?.code !== 'tv_portfolio_auth_invalid_credentials'
      ) {
        return { ok: false, code: 'connector_failed' };
      }
      return { ok: false, code: 'invalid_credentials' };
    }
    const { user_id: id, display_name: displayName, user_email: email } = result.data || {};
    if (!id) return { ok: false, code: 'invalid_credentials' };
    return { ok: true, user: { id: String(id), display_name: displayName || '', email: email || '' } };
  }

  /**
   * Re-validate a session's user. Returns a reachable flag so callers can fail
   * closed when WordPress is unavailable.
   */
  async function checkUser(userId) {
    const result = await call(`check-user?user_id=${encodeURIComponent(userId)}`);
    if (result.fatal) return { reachable: false, allowed: false };
    if (!result.ok) return { reachable: false, allowed: false };
    return { reachable: true, allowed: Boolean(result.data && result.data.allowed) };
  }

  return { authenticate, checkUser };
}

function createMockClient(cfg) {
  const allowedLogin = cfg.wp.mockUser;
  const allowedPassword = cfg.wp.mockPassword;

  async function authenticate(login, password) {
    // Constant-time-ish comparison is unnecessary for a dev mock, but keep the
    // responses identical to the real plugin contract.
    if (login === allowedLogin && password === allowedPassword) {
      return {
        ok: true,
        user: {
          id: String(cfg.wp.mockUserId),
          display_name: 'Dev Admin',
          email: 'dev@example.test',
        },
      };
    }
    return { ok: false, code: 'invalid_credentials' };
  }

  async function checkUser(userId) {
    return { reachable: true, allowed: String(userId) === String(cfg.wp.mockUserId) };
  }

  return { authenticate, checkUser };
}