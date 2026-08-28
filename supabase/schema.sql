-- ============================================================
-- Supabase schema for the portfolio leads dashboard
-- Run this in "SQL Editor" of your Supabase project (Settings > Database > SQL).
-- It creates the public "leads" table with Row Level Security:
--   - anyone (anonymous visitor) can INSERT a lead (the quote form)
--   - only authenticated users (you) can SELECT / UPDATE / DELETE
-- ============================================================

create extension if not exists pgcrypto; -- provides gen_random_uuid()

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company_name text,
  company_type text,
  goals text,
  objective text,
  budget text,
  details text,
  additional_info text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table public.leads
  add constraint leads_status_check
  check (status in ('new', 'contacted', 'negotiation', 'won', 'lost'));

alter table public.leads enable row level security;

-- Visitors submitting the quote form may create leads.
create policy "Public can insert leads" on public.leads
  for insert to anon, authenticated
  with check (true);

-- Only signed-in users (you) can read leads.
create policy "Authenticated can read leads" on public.leads
  for select to authenticated
  using (auth.uid() is not null);

-- Only signed-in users can update lead status.
create policy "Authenticated can update leads" on public.leads
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Only signed-in users can delete leads.
create policy "Authenticated can delete leads" on public.leads
  for delete to authenticated
  using (auth.uid() is not null);

-- ============================================================
-- After running this SQL:
--   1. Authentication > Users > Add user  -> create your admin e-mail + password.
--   2. Copy the project URL and the public "anon" key from
--      Settings > API, and paste them into js/config.js.
--   3. The admin dashboard is available at /#/admin (hash route).
-- ============================================================