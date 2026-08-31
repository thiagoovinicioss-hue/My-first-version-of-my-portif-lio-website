# Thiago Vinícius — Portfólio Website

Static, trilingual (PT / EN / ES) personal portfolio. Landing page with a 3D
project carousel, a multi-step quote (orçamento) flow that hands off to WhatsApp
and a **private leads dashboard** whose authentication & authorization layer is
**WordPress**.

The portfolio itself remains a **plain static site** (HTML + CSS + ES modules)
hosted on GitHub Pages — it is NOT a WordPress theme and WordPress does not
render a single public page of it.

## How the private area is secured

```
Visitor
   ↓
Portfolio (static site, GitHub Pages)
   ↓
#/admin  (private area)
   ↓
Portfolio Backend (Node/Express — server-side, HttpOnly session cookie)
   ↓ validates against
WordPress  ← authentication (native users + password hashing)
   ↓ authorizes via capability
tv_portfolio_access  (granted per WordPress user, changeable in wp-admin)
   ↓
Supabase leads (private data, service role key used ONLY server-side)
```

Security properties:

- **Real server-side authentication.** The browser never talks to WordPress or
  to the database directly. All private requests go through the backend, which
  validates the session, re-checks authorization against WordPress, and only
  then touches the lead data.
- **HttpOnly + Secure + SameSite session cookie** issued by the backend. No
  JWT/localStorage session, no frontend `isAuthenticated` flag. Frontend JS can
  neither read nor forge the session.
- **Fail closed.** If WordPress or the backend is unreachable, private access is
  denied (never assumed). A revoked capability takes effect at the next session
  re-validation.
- **Capability-based authorization.** The authorized WordPress account is
  changeable in **Users → Portfolio Access** with zero code changes.
- **Brute-force protection** at two levels: the backend rate-limits
  `/api/login`, and the WordPress plugin rate-limits the credentials endpoint.
- **CORS** restricted to the exact frontend origin; state-changing requests must
  come from an allowlisted Origin (CSRF); private responses are `no-store`.
- **No hardcoded credentials.** Every secret lives in environment variables.

## Project structure

```
index.html            SPA shell (home / quote / admin views + header/footer)
css/                  main, carousel, quote, admin styles
js/                   ES modules: config, i18n, projects, carousel, quote, backend, ui, admin, main
assets/               profile.webp, og.webp, apple-touch-icon.png, previews/*.webp
supabase/schema.sql   database setup for the leads table (unchanged)
wp/tv-portfolio-auth  WordPress plugin (authentication/authorization endpoints + admin UI)
server/               Portfolio backend (Node/Express) — auth proxy + private API
favicon.svg, robots.txt, sitemap.xml
```

## Components and what changed

| Piece | Role | Where |
|---|---|---|
| Portfolio (frontend) | Public site + admin UI shell | repo root, GitHub Pages |
| WordPress + plugin | Users, native password hashing, capability checks | `wp/tv-portfolio-auth` |
| Portfolio backend | Session management, auth proxy, private leads API | `server/` |
| Supabase | Lead storage (quote form inserts + dashboard reads) | `supabase/schema.sql` |

## 1. WordPress side (one time)

1. Install **WordPress** (self-hosted/Managed WP — any hosting).
2. Upload the folder `wp/tv-portfolio-auth` to `wp-content/plugins/` and activate
   the plugin **TV Portfolio Auth**.
3. Create an **Administrator** user to be the “connector account” (the backend
   uses this account to talk to WordPress). On its **Profile** page, generate an
   **Application Password** (Settings/Users → Profile → “Application Passwords”).
4. Open **Users → Portfolio Access** and tick the WordPress users allowed to
   access the private area. The plugin grants/revokes the `tv_portfolio_access`
   capability — no frontend change needed to switch accounts later.

## 2. Portfolio backend (the only private piece)

The backend is a small Node (≥ 18) Express service. Deploy it to any hosting
that runs a long-lived process (Render, Railway, Fly.io, a VPS, …).

1. `cd server && npm install`
2. `cp .env.example .env` and fill every variable
   (WordPress URL + connector Application Password, Supabase URL + **service
   role** key, the exact frontend origin, cookie/session settings).
3. Run with `npm start` (or your platform's start command).

### Sensitive environment variables (never commit)

| Variable | Purpose |
|---|---|
| `WORDPRESS_URL` | Your WordPress base URL |
| `WORDPRESS_CONNECT_USER` / `WORDPRESS_CONNECT_APP_PASSWORD` | Connector account credentials (Application Password) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Lead storage, server-side only |
| `FRONTEND_ORIGINS` | Exact origin(s) allowed to call the API |
| `COOKIE_SECURE` | Must stay `1` behind TLS |

> The old Supabase secret key (`sb_secret_*`) lives only in the local,
> gitignored `.env.local` and must never be placed in `js/config.js` or shipped
> to the browser.

## 3. Point the frontend at the backend

In `js/config.js`, the private area is controlled by one public value:

```js
auth: {
  apiBaseUrl: 'https://portfolio-api.example.com', // backend URL, no trailing slash
},
```

Leave it empty to run the site with the private area disabled.

## 4. Public configuration (`js/config.js` — unchanged behaviour)

| Setting | What to do |
|---|---|
| `whatsapp.number` | Your real WhatsApp number (digits only). |
| `social.*` | LinkedIn / Instagram / YouTube / GitHub links. |
| `profileImage` | Path to `assets/profile.webp`. |
| `supabase.url` / `supabase.anonKey` | Leave empty for frontend-only mode (quote works, leads not stored). Fill to enable lead storage. |

The leads table and RLS are unchanged (`supabase/schema.sql`):
visitors insert quotes with the publishable/anon key; the backend reads/updates/
deletes with the service role key after server-side authorization.

## REST API (private, backend)

| Method | Endpoint | Auth |
|---|---|---|
| `POST` | `/api/login` | rate-limited, validates via WordPress |
| `POST` | `/api/logout` | session cookie |
| `GET` | `/api/session` | session cookie, re-validated vs WordPress |
| `GET` | `/api/leads` | session cookie |
| `PATCH` | `/api/leads/:id` | session cookie, `{ "status": "won" }` |
| `DELETE` | `/api/leads/:id` | session cookie |

Every private endpoint fails closed with `503` when WordPress can't be reached.

## WordPress REST endpoints (server-to-server only, connector Basic auth)

| Endpoint | Purpose |
|---|---|
| `POST /wp-json/tv-portfolio-auth/v1/authenticate` | Validate username/email + password (native `wp_authenticate`), check capability |
| `GET /wp-json/tv-portfolio-auth/v1/check-user?user_id=` | Re-validate that the user still exists and is authorized |

Both are protected by `current_user_can('manage_options')` — callable only by
an authenticated connector account (Application Password). They are never called
by the browser.

## Run locally (frontend only)

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Run locally (full stack + mocks)

Dev-only mock WordPress (no install needed) and an in-memory lead store are
included for testing the whole flow:

```bash
cd server
npm run mock-wp            # terminal 1 — fake WordPress REST API on :8788
npm run dev                # terminal 2 — backend
# backend .env: WP_MOCK=0, WORDPRESS_URL=http://127.0.0.1:8788,
#               MOCK_WP_USER=admin MOCK_WP_PASSWORD=secret,
#               MOCK_WP_CONNECT_USER=admin MOCK_WP_CONNECT_PASS=apppass,
#               SUPABASE_MOCK=1, COOKIE_SECURE=0, FRONTEND_ORIGINS=http://localhost:8080
# frontend js/config.js: auth.apiBaseUrl = 'http://localhost:8787'
```

Sign in at `/#/admin` with `admin` / `secret`. Or use `WP_MOCK=1` + `SUPABASE_MOCK=1`
to run the backend with no external services at all. Mocks are dev-only and gated
by env vars.

## Tests

```bash
cd server && npm test
```

Covers: unauthenticated denial, generic login errors, session cookie attributes,
authenticated CRUD, capability revocation, logout invalidation, expired sessions,
fail-closed behaviour, CSRF origin checks, rate limiting and the real HTTP
transport against the mock WordPress.

## Deploy to GitHub Pages

Push to `main` with Pages enabled (Settings → Pages → source `main`, root).

- Site: `https://thiagoovinicioss-hue.github.io/My-first-version-of-my-portif-lio-website/`
- Quote: `/My-first-version-of-my-portif-lio-website/#/orcamento`
- Admin: `/My-first-version-of-my-portif-lio-website/#/admin`

Set `CONFIG.auth.apiBaseUrl` to the deployed backend URL and add the GitHub
Pages origin to `FRONTEND_ORIGINS` on the backend.