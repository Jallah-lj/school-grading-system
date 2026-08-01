<div align="center">

# School Grading System

**A professional, secure, production-ready platform for student assessment, automatic grade computation, report cards, and academic analytics.**

React 18 · TypeScript · Tailwind CSS · Chart.js · Express · Prisma · PostgreSQL · JWT + RBAC

</div>

---

## Features

### Roles & access control (RBAC)

| Capability | Admin | Teacher | Student | Parent |
|---|:-:|:-:|:-:|:-:|
| Manage users, students, teachers, classes, subjects | Yes | — | — | — |
| **Manage parent accounts** — create parents, link/unlink children, reset passwords (dedicated Parents page + `parentEmail` on student forms/bulk import) | Yes | — | — | — |
| **Bulk import students from Excel/CSV** — template download, per-row validation, auto admission numbers & passwords, credentials export | Yes | — | — | — |
| Configure grading scales, academic years & terms | Yes | — | — | — |
| Enter / edit marks **before approval** | Yes | Yes | — | — |
| **Fast mark entry** — Excel template/import, paste-from-Excel, keyboard navigation, column fill, auto-save drafts | Yes | Yes | — | — |
| Submit → Approve → **Publish** workflow | Yes | submit | — | — |
| **Approval inbox** — one-click approve / return with note, sidebar badge, deep-link notifications | Yes | notified | — | — |
| Delete students/teachers/parents **with password step-up verification** (failures audit-logged) | Yes | — | — | — |
| **Audit log page** — filter by action/entity/date/user, inspect event payloads | Yes | — | — | — |
| View grades, GPA, class ranking, progress | Yes | Yes | Yes | Yes (child) |
| Report cards, transcripts, PDF downloads | Yes | class | own | child |
| Upload digital signature (draw / photo) | Yes | Yes | — | — |
| Configure school name, badge & ID prefix | Yes | — | — | — |
| Analytics dashboards (distribution, trends, comparisons) | Yes | Yes | — | — |
| Notifications — read, **delete individually or clear all**, deep links | Yes | Yes | Yes | Yes |
| Audit trail, JSON backup | Yes | — | — | — |

### Automatic calculations — *no manual math ever*
Weighted totals · percentages · letter grades & grade points (configurable scale) · credit-weighted **GPA** · **CGPA** across terms · **subject ranking**, **class position** and overall ranking (competition ranking with tie handling).

### Report cards
School branding, student info, per-subject marks & remarks, GPA & position, teacher/principal remarks, **digital signatures**, **QR code** pointing to a public verification page, **PDF export**, plus CSV grade sheets and class reports (Excel-compatible).

### Auto-generated identification numbers
Registration never asks admins to type admission or staff numbers — the system **assigns them automatically** (students: `SGS-2025-0013`, teachers: `SGS-STF-004`). Atomic database sequences guarantee uniqueness even under concurrent registrations; numbers bootstrap above any existing data and are **immutable** afterwards, so conflicts are impossible. The prefix is configurable.

### School branding (badge + name)
Upload the **school badge/crest** and edit the **school name, motto and ID prefix** from *Administration → School*. Branding appears instantly on report-card PDFs, transcripts, the public QR-verification page, the login screen and the sidebar. Badges are auto-resized (≤512px PNG) and stored in PostgreSQL — no file storage needed.

### Digital signatures
Teachers and admins capture their signature two ways — **draw it on screen** (mouse/touch/stylus pad) or **photograph a paper signature** and upload it. The server auto-cleans uploads (EXIF rotation → paper background made transparent → ink auto-crop → compression), stores the PNG in PostgreSQL, and stamps it automatically on every report card: the class-teacher slot uses the class's homeroom teacher; the principal slot uses the admin who published the card. Signatures also appear on the public QR-verification page and transcripts.

### Parent accounts & academic progress
Admins create parent accounts on the dedicated **Parents** page (sidebar) — name, email, password — then link each parent to their children: either from the parent record (pick any unlinked student), or via the *Parent email* field when registering or editing students and in bulk imports. One parent can have many children. A parent signs in with their own account and sees every linked child in **Academic Progress** (child selector, GPA/average/position, subject results, GPA trend, transcript PDF), plus report cards and grade-published notifications. Deleting a parent removes the login account and unlinks the children — the student records themselves are kept.

### UI/UX
Modern dashboard · responsive layout · **dark & light mode** · sidebar navigation · interactive sortable/paginated tables · validated forms (React Hook Form + Zod) · Chart.js visualizations · loading skeletons · toast notifications · confirmation dialogs.

---

## Monorepo layout

```
school-grading-system/
├── docker-compose.yml          # one-command local PostgreSQL
├── docs/
│   ├── API.md                  # full REST API reference
│   ├── ER-DIAGRAM.md           # entity-relationship diagram (Mermaid)
│   └── DEPLOYMENT.md           # Supabase + Railway + Vercel guide
├── server/                     # Backend: Express + TypeScript + Prisma
│   ├── prisma/
│   │   ├── schema.prisma       # 19 models, fully normalized
│   │   ├── migrations/         # SQL migrations
│   │   └── seed.ts             # demo school (Rwanda-flavored data)
│   ├── scripts/                # live e2e verification suites (.py)
│   └── src/
│       ├── config/env.ts       # validated environment (Zod)
│       ├── lib/                # prisma, jwt, password, audit, idgen, spreadsheet
│       │   ├── grading.ts      # grading engine (totals → GPA → ranking)
│       │   └── grading.test.ts # engine unit tests
│       ├── middleware/         # auth (JWT + step-up password), RBAC, rate limits
│       ├── services/           # results, notifications, PDF reports, signatures, school
│       └── routes/             # auth, users, students (bulk import), teachers, subjects,
│                               # classes, academic-years, grade-scales, grades (+ import,
│                               # approvals inbox), analytics, report-cards, notifications,
│                               # signatures, school, reports (CSV), admin (audit, backup)
└── client/                     # Frontend: React + Vite + TS + Tailwind
    └── src/
        ├── lib/                # axios client (auto token refresh), auth context, hooks
        ├── components/         # layout, Icon system, UI kit, toasts, charts,
        │                       # confirm + password dialogs, signature pad, import modals
        └── pages/              # Login, Dashboard, Students (bulk import), Teachers,
                                # GradeEntry (speed toolkit), Approvals, MyGrades,
                                # ReportCards, Verify (public QR page), Analytics,
                                # AuditLogs, Administration
```

---

## Quick start

**Prerequisites:** Node.js ≥ 18, PostgreSQL 14+ (or `docker compose up -d db`).

```bash
# 1 ── Backend
cd server
cp .env.example .env # adjust DATABASE_URL if needed
npm install
npx prisma migrate dev # create tables
npm run db:seed # demo school data + computed Term-2 results
npm run dev # → http://localhost:4000/api

# 2 ── Frontend (second terminal)
cd client
npm install
npm run dev # → http://localhost:5173
```

### Demo accounts (after seeding)

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@school.rw` | `Admin@123` |
| **Teacher** | `m.habimana@school.rw` | `Teacher@123` |
| **Student** | `student@school.rw` | `Student@123` |
| **Parent** | `parent@school.rw` | `Parent@123` |

### Try the golden path
1. Sign in as **teacher** → *Grade Entry* → pick Term 3 / Senior 1 A / Mathematics → enter marks → **Submit for Approval**.
2. Sign in as **admin** → *Grade Entry* → **Approve & Compute** (totals/GPA/positions auto-computed) → **Publish**.
3. Sign in as **student** → instant notification → *My Grades* (GPA 3.70, position 1) → *Report Cards* → download **PDF**; scan the **QR** to open the public verification page.
4. Admin → *Dashboard* / *Analytics* for live charts; *Administration* to edit the grading scale, manage users & years, or download a JSON **backup**.

---

## Grading engine

`server/src/lib/grading.ts` — pure, unit-tested functions:

```
percentage = Σ(weight × score / maxScore) ÷ Σ(weights) × 100
GPA = Σ(gradePoint × creditUnits) ÷ Σ(creditUnits)
CGPA = Σ(termPoints) ÷ Σ(termCredits) (credit-weighted across terms)
position = competition ranking ("1, 2, 2, 4")
```

Default scale (fully editable under *Administration → Grade Scales*):

| Marks | Grade | GPA | Remark |
|---|---|---|---|
| 90–100 | A+ | 4.0 | Excellent |
| 80–89 | A | 3.7 | Very Good |
| 70–79 | B+ | 3.3 | Good |
| 60–69 | B | 3.0 | Credit |
| 50–59 | C | 2.0 | Pass |
| < 50 | F | 0.0 | Fail |

Run the engine tests:

```bash
cd server && npm test # Yes boundary grades, weighting, GPA/CGPA, tie ranking
```

---

## Security

bcrypt password hashing (12 rounds) · short-lived JWT access tokens (15 min) + **rotating refresh tokens** with reuse detection · RBAC middleware on every route · Zod input validation · Prisma parameterized queries (SQL-injection safe) · Helmet security headers · CORS origin allowlist · dual rate limiting (global + auth) · full **audit log** of sensitive actions · teacher scope enforcement (teachers only touch assigned class/subject pairs) · published-mark immutability.

---

## Documentation

| Doc | Contents |
|---|---|
| [`docs/API.md`](docs/API.md) | Every endpoint: method, auth, params, payloads, responses |
| [`docs/ER-DIAGRAM.md`](docs/ER-DIAGRAM.md) | Mermaid ER diagram of all 16 tables |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Supabase (DB) + Railway (API) + Vercel (SPA), step by step |

---

## Deployment (production)

| Piece | Platform | Notes |
|---|---|---|
| Database | **Supabase** PostgreSQL | copy pooled connection string into `DATABASE_URL` |
| API | **Railway** / Render | build `npm run build`, start `npm start`, set env vars |
| Frontend | **Vercel** | root dir `client`, set `VITE_API_URL`, SPA rewrites |

Full walkthrough in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## Verification status

- Yes Backend `tsc --noEmit` clean · Prisma schema valid · migrations applied
- Yes Grading-engine unit tests pass (`npm test`)
- Yes Frontend `tsc --noEmit` clean · production `vite build` succeeds
- Yes End-to-end smoke test on live PostgreSQL: login/RBAC, refresh rotation, mark entry → submit → approve (auto-compute) → publish, notifications, student/parent views, PDF + QR verification, CSV/backup exports, audit trail — all green
