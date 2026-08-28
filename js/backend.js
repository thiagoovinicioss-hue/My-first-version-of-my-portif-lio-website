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

// ---- Quote form (public insert) ----
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

// ---- Admin (authenticated access only) ----
export async function signIn(email, password) {
  const supabase = await ensureClient();
  if (!supabase) throw new Error('backend not configured');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  const supabase = await ensureClient();
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getSession() {
  const supabase = await ensureClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session || null;
}

export function onAuthChange(callback) {
  ensureClient().then((supabase) => {
    if (!supabase) return;
    supabase.auth.onAuthStateChange((_event, session) => callback(session));
  });
}

async function requireUser() {
  const supabase = await ensureClient();
  const session = await getSession();
  if (!supabase || !session) throw new Error('unauthorized');
  return supabase;
}

export async function fetchLeads() {
  const supabase = await requireUser();
  const { data, error } = await supabase
    .from(CONFIG.supabase.leadsTable)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateLeadStatus(id, status) {
  const supabase = await requireUser();
  if (!CONFIG.statuses.includes(status)) throw new Error('invalid status');
  const { error } = await supabase
    .from(CONFIG.supabase.leadsTable)
    .update({ status })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteLead(id) {
  const supabase = await requireUser();
  const { error } = await supabase
    .from(CONFIG.supabase.leadsTable)
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}