# Deployment Guide

Target architecture: **Vercel** (frontend) · **Railway/Render** (API) · **Supabase** (PostgreSQL).

```
┌────────────┐ HTTPS ┌──────────────────┐ TLS ┌──────────────────┐
│ Vercel │ ─────────▶ │ Railway / Render │ ──────▶ │ Supabase │
│ React SPA │ /api/* │ Express API │ 5432 │ PostgreSQL 15 │
└────────────┘ └──────────────────┘ └──────────────────┘
```

---

## 1. Database — Supabase

1. Create a project at [supabase.com](https://supabase.com) → wait for provisioning.
2. **Settings → Database → Connection string → URI** and copy it. Prefer the *Session/Transaction pooler* host for serverless-style workloads:
 ```
 postgresql://postgres.<project>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
 ```
3. Locally, apply schema + seed:
 ```bash
 cd server
 DATABASE_URL="<supabase-uri>" npx prisma migrate deploy
 DATABASE_URL="<supabase-uri>" npm run db:seed
 ```

> Tip: keep direct (non-pooled) URI for `prisma migrate deploy` and the pooled URI in runtime `DATABASE_URL` if you hit prepared-statement issues (PgBouncer): append `?pgbouncer=true&connection_limit=1`.

## 2. API — Railway (Render is analogous)

1. Push the repo to GitHub, then **Railway → New Project → Deploy from GitHub**.
2. Set **Root Directory** to `server`.
3. Variables (Service → Variables):
 | Key | Value |
 |---|---|
 | `DATABASE_URL` | Supabase URI |
 | `JWT_ACCESS_SECRET` | 32+ char random string |
 | `JWT_REFRESH_SECRET` | different 32+ char random string |
 | `CLIENT_URL` | `https://<your-app>.vercel.app` |
 | `SCHOOL_NAME` / `SCHOOL_MOTTO` | your school's branding |
 | `PORT` | `4000` (Railway injects `PORT` automatically — the app respects it) |
4. Build & start commands:
 ```
 Build: npm install && npm run build
 Start: npm start
 ```
 (`npm run build` runs `prisma generate` + `tsc`.)
5. Add a one-off deploy command (or run from your machine): `npx prisma migrate deploy`.
6. Copy the public domain, e.g. `https://sgs-api.up.railway.app` and verify:
 `curl https://sgs-api.up.railway.app/api/health` → `{"status":"ok"}`.

## 3. Frontend — Vercel

1. **Vercel → New Project → Import repo**; set **Root Directory** to `client`.
2. Framework preset: **Vite** (build `npm run build`, output `dist`).
3. Environment variable:
 ```
 VITE_API_URL=https://sgs-api.up.railway.app/api
 ```
4. SPA deep links (`/verify/ABC123`, `/grades`, …) need a rewrite — add `client/vercel.json`:
 ```json
 { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
 ```
 (Already safe to commit; Vercel only reads it from the client root.)
5. Back in Railway, update `CLIENT_URL` to the Vercel domain so CORS and QR-verification URLs are correct (the QR on PDF report cards points at `${CLIENT_URL}/verify/<code>`).

> **Native deps:** `sharp` (signature image processing) ships prebuilt Linux binaries — Railway/Render install it automatically; no extra buildpack needed. Signature PNGs live **in Postgres**, so no file-storage volume is required.

## 4. Post-deploy checklist

- [ ] `GET /api/health` returns ok
- [ ] Login with seeded admin works, then **change all demo passwords** (or reseed without demo accounts)
- [ ] `JWT_*_SECRET`s are long, random and different from dev
- [ ] `CLIENT_URL` matches the exact Vercel origin (no trailing slash)
- [ ] Teacher can only see assigned classes; publishing notifies a test student/parent
- [ ] Set up Supabase **scheduled backups** (or use `GET /api/admin/backup` regularly)

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
