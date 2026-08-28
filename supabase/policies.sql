-- ============================================================
-- RLS policies for an EXISTING public.leads table (idempotent).
--
-- Use this instead of schema.sql when the table already exists
-- (e.g. created via the Table Editor or schema.sql earlier).
-- It never recreates the table and never drops data.
-- Safe to re-run any time.
--
-- Run it in: Supabase -> SQL Editor -> New query -> Run.
-- ============================================================

alter table public.leads enable row level security;

-- Visitors submitting the quote form may create leads.
drop policy if exists "Public can insert leads" on public.leads;
create policy "Public can insert leads" on public.leads
  for insert to anon, authenticated
  with check (true);

-- Only signed-in users (you) can read leads.
drop policy if exists "Authenticated can read leads" on public.leads;
create policy "Authenticated can read leads" on public.leads
  for select to authenticated
  using (auth.uid() is not null);

-- Only signed-in users can update lead status.
drop policy if exists "Authenticated can update leads" on public.leads;
create policy "Authenticated can update leads" on public.leads
  for update to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- Only signed-in users can delete leads.
drop policy if exists "Authenticated can delete leads" on public.leads;
create policy "Authenticated can delete leads" on public.leads
  for delete to authenticated
  using (auth.uid() is not null);

-- ============================================================
-- After this: your admin user (Authentication > Users) can sign
-- in at /#/admin and manage leads. The secret key stays local.
-- ============================================================