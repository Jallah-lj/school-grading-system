# Deployment Guide

Target architecture: **Vercel** (frontend) · **Railway/Render** (API) · **Supabase** (PostgreSQL).

```
┌────────────┐ HTTPS ┌──────────────────┐ TLS ┌──────────────────┐
│ Vercel │ ─────────▶ │ Railway / Render │ ──────▶ │ Supabase │
│ React SPA │ /api/* │ Express API │ 5432 │ PostgreSQL 15 │
└────────────┘ └──────────────────┘ └──────────────────┘
```

---

## 0. Root build — one command for the whole repo

The repository ships a root `package.json` so Render/Railway services can be
configured with the **repo root as the Root Directory** and the default
commands:

```
Build:  npm install && npm run build
Start:  npm start
```

`npm run build` installs and builds **both** the React client (`client/`) and
the Express API (`server/`), then `npm start` launches the API. The scripts
pass `--include=dev` to `npm install` on purpose: Render sets
`NODE_ENV=production`, which would otherwise skip the dev dependencies
(TypeScript, Vite, the Prisma CLI) that the build needs.

> **Symptom this fixes** — a deploy failing with
> `npm error enoent Could not read package.json ... /opt/render/project/src/package.json`
> means the service runs `npm install` at the repo root while no root
> `package.json` existed. After this change, redeploy as-is; no dashboard
> settings need to change. (Pointing Root Directory at `server` also still
> works for an API-only service.)

---

## 1. Database — Supabase

1. Create a project at [supabase.com](https://supabase.com) → wait for provisioning.
2. **Settings → Database → Connection string → URI** and copy it. Prefer the _Session/Transaction pooler_ host for serverless-style workloads:

```
postgresql://postgres.<project>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

3. Locally, apply schema + seed:

```bash
cd server
DATABASE_URL="<supabase-uri>" npx prisma migrate deploy
DATABASE_URL="<supabase-uri>" npm run db:seed
```

> Tip: keep a direct (non-pooled) URI for `prisma migrate deploy`. For this persistent Express API, use Supabase's **session pooler** URI at runtime and allow a small pool, for example `?connection_limit=5&pool_timeout=30`. Do not use `connection_limit=1`: concurrent page queries and grade auto-saves will exhaust a single connection. If you use a transaction-mode PgBouncer endpoint, also add `pgbouncer=true`.

## 2. API — Railway (Render is analogous)

1. Push the repo to GitHub, then **Railway → New Project → Deploy from GitHub**.
2. Set **Root Directory** to `server`.
3. Variables (Service → Variables):
   | Key                            | Value                                                               |
   | ------------------------------ | ------------------------------------------------------------------- |
   | `DATABASE_URL`                 | Supabase URI                                                        |
   | `JWT_ACCESS_SECRET`            | 32+ char random string                                              |
   | `JWT_REFRESH_SECRET`           | different 32+ char random string                                    |
   | `ACCESS_TOKEN_TTL`             | `15m` (raw value, without quotes or `ACCESS_TOKEN_TTL=`)            |
   | `CLIENT_URL`                   | `https://<your-app>.vercel.app`                                     |
   | `SCHOOL_NAME` / `SCHOOL_MOTTO` | your school's branding                                              |
   | `PORT`                         | `4000` (Railway injects `PORT` automatically — the app respects it) |

The `DATABASE_URL` value must be the URI itself and start with `postgresql://` (or `postgres://`). In a hosting dashboard, do **not** paste `DATABASE_URL=...`, `<supabase-uri>`, or surrounding quotes. For Supabase runtime connections, use `connection_limit=5&pool_timeout=30` rather than a single connection. If the database is another Railway service, use Railway's reference syntax (replace `Postgres` with the exact service name):

```
${{Postgres.DATABASE_URL}}
```

Railway should resolve that reference to the actual URI before starting the API. An unresolved reference or placeholder is not a database URL.

4. Build & start commands:

```
Build: npm install && npm run build
Start: npm start
```

(`npm run build` runs `prisma generate` + `tsc`.) With Root Directory set to
`server`, these commands are picked up from `server/package.json`. You may
instead leave Root Directory at the repo root — the root `package.json`
(see [section 0](#0-root-build--one-command-for-the-whole-repo)) builds both
client and server and `npm start` still launches the API. 5. Add a one-off deploy command (or run from your machine): `npx prisma migrate deploy`. 6. Copy the public domain, e.g. `https://sgs-api.up.railway.app` and verify:
`curl https://sgs-api.up.railway.app/api/health` → `{"status":"ok"}`.

## 3. Frontend — Vercel

1. **Vercel → New Project → Import repo**; set **Root Directory** to `client`.
2. Framework preset: **Vite** (build `npm run build`, output `dist`).
3. Environment variable:

```
VITE_API_URL=https://sgs-api.up.railway.app/api
```

> Hosting the frontend on **Render** instead? Set Root Directory to `client`,
> Build `npm install && npm run build`, Start `npm run preview`, and set the
> same `VITE_API_URL` variable.

4. SPA deep links (`/verify/ABC123`, `/grades`, …) need a rewrite — add `client/vercel.json`:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

(Already safe to commit; Vercel only reads it from the client root.) 5. Back in Railway, update `CLIENT_URL` to the Vercel domain so CORS and QR-verification URLs are correct (the QR on PDF report cards points at `${CLIENT_URL}/verify/<code>`).

> **Native deps:** `sharp` (signature image processing) ships prebuilt Linux binaries — Railway/Render install it automatically; no extra buildpack needed. Signature PNGs live **in Postgres**, so no file-storage volume is required.

## 4. Post-deploy checklist

- [ ] `GET /api/health` returns ok
- [ ] Login with seeded admin works, then **change all demo passwords** (or reseed without demo accounts)
- [ ] `JWT_*_SECRET`s are long, random and different from dev
- [ ] `CLIENT_URL` matches the exact Vercel origin (no trailing slash)
- [ ] Teacher can only see assigned classes; publishing notifies a test student/parent
- [ ] Set up Supabase **scheduled backups** (or use `GET /api/admin/backup` regularly)
- [ ] Newer endpoints answer (not 404), e.g. `curl -i -X POST $API/api/announcements/broadcast` should return **401**, not 404
- [ ] `GET /api/health` reports the **commit you just deployed** and lists `announcements` in `routes` (proves the build is not stale)

### Troubleshooting: “Route not found” / “No API route matches …”

That JSON comes from the API's catch-all 404 handler, so the server is up but
the path didn't match a mounted router. In order of likelihood:

1. **The deployed API is running an older build.** This is by far the most
   common cause, and it is easy to miss: **when a deploy's build step fails, the
   host keeps the previous deploy running.** The service stays healthy and
   `GET /api/health` returns ok, so nothing looks broken — but every endpoint
   added since the last *successful* build 404s.

   Diagnose it in one call:

   ```bash
   curl -s $API/api/health   # → { "commit": "...", "routes": [...] }
   ```

   `routes` lists every namespace the **running** build mounts and `commit` is
   the deployed git SHA. If `announcements` is absent from `routes`, or `commit`
   is behind `git rev-parse HEAD`, you are on a stale build. Open the host's
   **deploy/build logs** (not the runtime logs) and look for the last red build,
   then fix the build error and redeploy.

   > A real occurrence: `tsc` started failing because of a type error in a
   > `src/__tests__/` file that the production build was compiling. Every deploy
   > after that silently no-op'd. `server/tsconfig.json` now excludes test files
   > from the emitted build (they are still type-checked via
   > `npm run typecheck`), and `npm run verify` runs lint + typecheck + tests +
   > the real production build + `scripts/verify-routes.mjs` so a broken build
   > is caught before it silently freezes the deploy. Run it before every
   > release, or enable it in CI by moving `docs/ci-workflow.yml` to
   > `.github/workflows/ci.yml` (requires a token/account with the
   > GitHub `workflows` permission).
2. **`VITE_API_URL` is wrong or missing.** If the frontend calls a path that the
   host rewrites to `index.html`, you get HTML (or a Vercel 404) instead of the
   API. Set it to the full API base including `/api`.
3. **Stale rewrite target.** `client/vercel.json` rewrites `/api/(.*)` to a
   hard-coded API domain — make sure that domain is the API you actually deploy.
4. **Wrong method.** `/api/announcements/broadcast` is `POST`-only; a `GET`
   falls through to the 404 handler.

## 5. Alternative: all-in-one VPS / Docker

```bash
docker compose up -d db # postgres on the host
cd server && npm ci && npm run build && npx prisma migrate deploy && npm start
cd ../client && npm ci && npm run build # serve dist/ with nginx, proxy /api → :4000
```

Suggested nginx snippet:

```nginx
location /api/ { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; }
location / { root /var/www/sgs/dist; try_files $uri /index.html; }
```
