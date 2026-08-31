import { CONFIG, isBackendConfigured } from './config.js';

const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let client = null;
let loadPromise = null;

async function ensureClient() {
  if (!isBackendConfigured()) return null;
  if (client) return client;
  if (!loadPromise) {
    loadPromise = import(/* webpackIgnore: true */ SUPABASE_CDN).then((mod) => {
      client = mod.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      return client;
    });
  }
  return loadPromise;
}

// ---- Quote form (public insert, direct to Supabase with anon key + RLS) ----
export async function saveLead(payload) {
  const supabase = await ensureClient();
  if (!supabase) throw new Error('backend not configured');
  const { data, error } = await supabase
    .from(CONFIG.supabase.leadsTable)
    .insert({
      name: String(payload.name || '').slice(0, 120),
      company_name: String(payload.company_name || '').slice(0, 160),
      company_type: String(payload.company_type || '').slice(0, 100),
      goals: String(payload.goals || '').slice(0, 100),
      objective: String(payload.objective || '').slice(0, 100),
      budget: String(payload.budget || '').slice(0, 80),
      details: String(payload.details || '').slice(0, 2000),
      additional_info: String(payload.additional_info || '').slice(0, 2000),
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ---- Private area (authenticated via the portfolio auth backend) ----
//
// The browser never talks to WordPress or to the database directly. It calls
// our server, which validates the WordPress session (HttpOnly cookie),
// re-checks authorization against WordPress, and only then touches the data.
// Fail-closed: when the backend or WordPress is unavailable, requests fail
// instead of silently allowing access.

async function api(path, opts = {}) {
  const { apiBaseUrl } = CONFIG.auth;
  if (!apiBaseUrl) throw new Error('unavailable');

  const options = { ...opts, credentials: 'include' };
  options.headers = { Accept: 'application/json', ...(opts.headers || {}) };
  if (options.body !== undefined && typeof options.body !== 'string') {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  let res;
  try {
    res = await fetch(`${apiBaseUrl}${path}`, options);
  } catch (_) {
    throw new Error('unavailable');
  }

  let data = null;
  try { data = await res.json(); } catch (_) { /* ignore */ }

  if (res.status === 429) throw new Error('rate_limited');
  if (res.status === 401 || res.status === 403) throw new Error('unauthorized');
  if (!res.ok) throw new Error(res.status >= 500 ? 'unavailable' : 'request_failed');
  return data;
}

export async function signIn(login, password) {
  return api('/api/login', { method: 'POST', body: { login, password } });
}

export async function signOut() {
  await api('/api/logout', { method: 'POST' });
}

export async function getSession() {
  const data = await api('/api/session');
  return {
    authenticated: Boolean(data?.authenticated),
    user: data?.user || null,
  };
}

export async function fetchLeads() {
  const data = await api('/api/leads');
  return data?.leads || [];
}

export async function updateLeadStatus(id, status) {
  await api(`/api/leads/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } });
}

export async function deleteLead(id) {
  await api(`/api/leads/${encodeURIComponent(id)}`, { method: 'DELETE' });
}