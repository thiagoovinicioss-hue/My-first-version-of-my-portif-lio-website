# Thiago Vinícius — Portfólio Website

Static, trilingual (PT / EN / ES) personal portfolio. Landing page with a 3D
project carousel, a multi-step quote (orçamento) flow that hands off to WhatsApp
and an optional leads dashboard backed by Supabase.

Zero build step — plain HTML + CSS + ES modules, hosted on GitHub Pages.

## Features

- **Landing page** — hero, about, 3D carousel of 10 real projects, contact section.
- **Quote flow** (`#/orcamento`) — 4 steps, validation, review/edit, honeypot
  anti-bot, and a pre-filled WhatsApp message on submit.
- **Admin dashboard** (`#/admin`) — login-protected leads panel (stats, filters
  by status, update status, delete).
- **Trilingual** — PT-BR default, EN, ES; language persists in `localStorage`.
- **A11y & performance** — reduced-motion support, keyboard navigation, semantic
  markup, lazy images, `prefers-reduced-motion`, WebP assets.

## Project structure

```
index.html            SPA shell (home / quote / admin views + header/footer)
css/                  main, carousel, quote, admin styles
js/                   ES modules: config, i18n, projects, carousel, quote, backend, ui, admin, main
assets/               profile.webp, og.webp, apple-touch-icon.png, previews/*.webp
supabase/schema.sql   database setup for the leads dashboard
favicon.svg, robots.txt, sitemap.xml
```

## Run locally

Any static server works. For example:

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Configuration

All public settings live in **`js/config.js`**:

| Setting | What to do |
|---|---|
| `whatsapp.number` | Replace `'5500000000000'` with your real number (digits only, e.g. `'5511999998888'`). |
| `social.*` | LinkedIn / Instagram / YouTube / GitHub links. |
| `profileImage` | Path to `assets/profile.webp` (replace with your own photo if you wish). |
| `supabase.url` / `supabase.anonKey` | Leave empty for **frontend-only mode** (quote still works, leads are not stored). Fill to enable the admin panel — see below. |

### Enabling the leads dashboard (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the contents of `supabase/schema.sql`.
   - If your `leads` table **already exists** (created earlier with the same
     columns), run `supabase/policies.sql` instead — it applies exactly the
     same Row Level Security rules without recreating the table.
3. In **Authentication → Users**, add your admin user with e-mail + password.
4. Copy the **Project URL** and the public **anon key** from **Settings → API**
   and paste them into `js/config.js` (`supabase.url` and `supabase.anonKey`).
5. Deploy. Your admin area is at `/#/admin`.

> The `anon` key is public by design. Real protection comes from Row Level
> Security (already in `schema.sql`): visitors may only insert, only signed-in
> users may read/update/delete.

## Security: the secret key stays out of Git

This is a **static site** (no server), so anything the browser must use is
technically visible in the Network tab. That is why the site only ships the
**public** publishable / anon key, and all write/read protection comes from
Supabase Row Level Security.

- The secret key (`sb_secret_*`) is **never** placed in `js/config.js` or any
  tracked file.
- It lives only in the local, gitignored **`.env.local`** (which also holds a
  copy of the URL + public keys for reference).
- If you ever need the secret key (e.g. server-side scripts, Edge Functions,
  bulk imports), use it only in backend code you control — never in the browser.

> If `.env.local` already existed with an old value, edit it locally; it is
> ignored by Git and will not be published.

## Deploy to GitHub Pages

Push to `main` with Pages enabled (Settings → Pages → source `main`, root).
The site is served from the repository root, so URLs are:

- Site: `https://thiagoovinicioss-hue.github.io/My-first-version-of-my-portif-lio-website/`
- Quote: `/My-first-version-of-my-portif-lio-website/#/orcamento`
- Admin: `/My-first-version-of-my-portif-lio-website/#/admin`

Canonical links and `sitemap.xml` already use this URL.
