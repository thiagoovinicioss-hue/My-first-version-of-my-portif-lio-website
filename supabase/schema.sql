-- ============================================================
-- Supabase schema for the portfolio leads dashboard
-- Run this in "SQL Editor" of your Supabase project (Settings > Database > SQL).
--
-- It creates the public "leads" table with Row Level Security:
--   - anyone (anonymous visitor) can INSERT a lead (the quote form)
--   - only the PORTFOLIO ADMIN (you, your Supabase Auth user) can
--     SELECT / UPDATE / DELETE leads through the anon key
--
-- This file already has the portfolio admin's UUID (below, from Supabase →
-- Authentication → Users). If you ever change the admin account, replace all
-- occurrences of that UUID.
--
-- The Node backend reads/updates/deletes leads with the SERVICE ROLE key, which
-- bypasses RLS, so administrative operations keep working regardless of these
-- policies. These policies exist to keep private leads safe from the PUBLIC anon
-- key: unauthenticated visitors and ANY OTHER Supabase user must NOT be able to
-- list them directly. If the placeholder is left untouched, no authenticated
-- user can read leads via the anon key at all (fail closed, still fine for the
-- backend).
-- ============================================================

create extension if not exists pgcrypto; -- provides gen_random_uuid()

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text,
  company_type text,
  contact text,
  goals text,
  objective text,
  budget text,
  details text,
  additional_info text,
  selected_addons text[] not null default '{}',
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.leads
  add constraint leads_status_check
  check (status in ('new', 'contacted', 'negotiation', 'won', 'lost'));

alter table public.leads enable row level security;

-- Visitors submitting the quote form may create leads.
drop policy if exists "Public can insert leads" on public.leads;
create policy "Public can insert leads" on public.leads
  for insert to anon, authenticated
  with check (true);

-- Only the portfolio admin may READ leads with the anon key.
drop policy if exists "Authenticated can read leads" on public.leads;
drop policy if exists "Admin can read leads" on public.leads;
create policy "Admin can read leads" on public.leads
  for select to authenticated
  using (auth.uid() = 'e84f0bfa-6755-48bb-a5cd-88f23d5c118f'::uuid);

-- Only the portfolio admin may UPDATE leads with the anon key.
drop policy if exists "Authenticated can update leads" on public.leads;
drop policy if exists "Admin can update leads" on public.leads;
create policy "Admin can update leads" on public.leads
  for update to authenticated
  using (auth.uid() = 'e84f0bfa-6755-48bb-a5cd-88f23d5c118f'::uuid)
  with check (auth.uid() = 'e84f0bfa-6755-48bb-a5cd-88f23d5c118f'::uuid);

-- Only the portfolio admin may DELETE leads with the anon key.
drop policy if exists "Authenticated can delete leads" on public.leads;
drop policy if exists "Admin can delete leads" on public.leads;
create policy "Admin can delete leads" on public.leads
  for delete to authenticated
  using (auth.uid() = 'e84f0bfa-6755-48bb-a5cd-88f23d5c118f'::uuid);

-- ============================================================
-- After running this SQL:
--   1. Authentication > Users > Add user  -> create your admin e-mail + password.
--   2. Copy the admin user's UUID (Authentication > Users > your user) into
--      ADMIN_USER_ID in the backend's .env  AND  replace the placeholder above.
--   3. Copy the project URL and the public "anon" key from
--      Settings > API into js/config.js.
--   4. The admin dashboard is available at /#/admin (hash route).
-- ============================================================