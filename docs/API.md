# API Reference — School Grading System

Base URL (dev): `http://localhost:4000/api` · All bodies are JSON.
Authenticated requests need `Authorization: Bearer <accessToken>`.
Error envelope: `{ "error": { "code": "STRING", "message": "…", "details?": … } }`.

| Code | Meaning |
|---|---|
| 401 `UNAUTHORIZED` / `INVALID_TOKEN` | Missing/expired token |
| 403 `FORBIDDEN` | Role not permitted |
| 404 `NOT_FOUND` | Record missing |
| 409 `CONFLICT` | Workflow/state conflict (e.g. marks published) |
| 422 `VALIDATION_ERROR` | Zod schema failed (details included) |
| 429 `RATE_LIMITED` | Too many requests |

## Auth (`/api/auth`, rate-limited 30/15 min)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/login` | `{ email, password }` | → `{ user, accessToken, refreshToken }` |
| POST | `/refresh` | `{ refreshToken }` | Rotates tokens; reuse of an old token revokes the session family |
| POST | `/logout` | `{ refreshToken }` | Revokes the refresh token |
| GET | `/me` | — | Current session user (with profile + role data) |
| POST | `/change-password` | `{ currentPassword, newPassword }` | Invalidates all sessions |

`user` includes role-specific data: `student { id, admissionNumber, classRoom }`, `teacher { id, staffNumber }`, or `parent { id, children[] }`.

## Users (ADMIN only)

| Method | Path | Notes |
|---|---|---|
| GET | `/users?role=&search=&page=&pageSize=` | List users (paged) |
| PATCH | `/users/:id` | `{ isActive?, role? }` — activate/deactivate or change role |
| POST | `/users/:id/reset-password` | `{ password }` — revokes sessions |

## School branding (`/api/school`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/school/public` | public | `{ name, motto, hasBadge }` — used by login & verify pages |
| GET | `/school/badge` | public | Badge PNG (cacheable) |
| GET | `/school/settings` | ADMIN | Full settings incl. `studentIdPrefix` |
| PATCH | `/school/settings` | ADMIN | `{ name?, motto?, studentIdPrefix? }` (prefix: 2–6 uppercase chars) |
| POST | `/school/badge` | ADMIN | multipart `file` (≤5 MB) → auto-resized to ≤512px PNG, stored in DB |
| DELETE | `/school/badge` | ADMIN | Remove badge |

**Auto-generated identifiers:** `POST /students` and `POST /teachers` no longer require identifiers — when `admissionNumber` / `staffNumber` is omitted the server assigns the next value atomically (`{prefix}-{year}-0001` for students, `{prefix}-STF-001` for teachers). Sequences bootstrap above existing data; both fields are immutable after creation.

## ‍ Students

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/students?search=&classId=&gender=&sortBy=name&sortDir=&page=&pageSize=` | ADMIN, TEACHER | Search by name/email/admission no. Server-side sort + pagination |
| POST | `/students` | ADMIN | `{ name, email, password, dateOfBirth, gender, classId?, parentEmail?, … }` — admission number **auto-assigned** (override optional); creates login + profile + enrollment |
| GET | `/students/:id` | auth | Profile with enrollments |
| PUT | `/students/:id` | ADMIN | Partial update (class change re-enrolls) |
| DELETE | `/students/:id` | ADMIN | **Requires step-up password** — body `{ password }` (the admin's own). Wrong/missing → 403/400 and a `DELETE_STUDENT_DENIED` audit event. Cascades user + records |
| GET | `/students/import/template` | ADMIN | Downloads `.xlsx` template — headers sheet, valid class list, usage notes |
| POST | `/students/import` | ADMIN | **Bulk import from Excel/CSV** — multipart `{ file }` (.xlsx/.csv, ≤5 MB, ≤500 rows). Row-wise: valid rows created (auto admission no., active-term enrolment, blank passwords auto-generated) and invalid rows reported. Returns `{ created, failed, errors[{row,email,reason}], credentials[] }`. Audit-logged as `BULK_IMPORT_STUDENTS` |
| GET | `/students/:id/results?semesterId=&all=` | self/parent/teacher/admin | Published `{ semester, results[], gpa }`; staff add `all=true` to preview unpublished |

`results[]`: `{ percentage, letterGrade, gradePoint, remark, position, subject { code, name, creditUnits } }` · `gpa`: `{ gpa, average, position, classSize, totalCredits }`.

## ‍ Teachers

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/teachers/me` | TEACHER | Own profile + assignments (with class student counts) |
| GET | `/teachers?search=&page=&pageSize=` | ADMIN, TEACHER | List |
| POST | `/teachers` | ADMIN | `{ name, email, password, staffNumber, qualification? }` |
| PUT | `/teachers/:id` | ADMIN | Update |
| DELETE | `/teachers/:id` | ADMIN | **Requires step-up password** — body `{ password }`; failures audit-logged as `DELETE_TEACHER_DENIED` |
| POST | `/teachers/:id/assignments` | ADMIN | `{ subjectId, classId }` |
| DELETE | `/teachers/:id/assignments/:assignmentId` | ADMIN | Unassign |

## Subjects & components

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/subjects` | auth | Includes components + counts |
| POST / PUT | `/subjects` · `/subjects/:id` | ADMIN | `{ code, name, creditUnits, department? }` |
| DELETE | `/subjects/:id` | ADMIN | Blocked when results exist |
| PUT | `/subjects/:id/components` | ADMIN | `[{ type: ASSIGNMENT\|QUIZ\|CAT\|PRACTICAL\|MIDTERM\|PROJECT\|FINAL, name, weight, maxScore }]` — **weights must total 100** (full replacement) |

## Classes

| Method | Path | Notes |
|---|---|---|
| GET | `/classes?academicYearId=` | With homeroom teacher + student/assignment counts |
| POST / PUT / DELETE | `/classes[…]` | ADMIN; `{ name, level, stream, academicYearId, homeroomTeacherId? }`; delete blocked while students assigned |
| GET | `/classes/:id/students` · `/classes/:id/subjects` | Roster / taught subjects |

## Academic years & terms

| Method | Path | Notes |
|---|---|---|
| GET | `/academic-years` · `/academic-years/active` | Active year includes all terms (current flagged) |
| POST | `/academic-years` | ADMIN `{ name, startDate, endDate, activate, semesters: [{ name, number, kind, startDate, endDate }] }` |
| POST | `/academic-years/:id/activate` | ADMIN — deactivate others |
| POST | `/academic-years/:id/semesters` | ADMIN — add a term |
| POST | `/academic-years/semesters/:semesterId/set-current` | ADMIN — opens that term for grading/dashboards |

## Grade scales (editable)

| Method | Path | Notes |
|---|---|---|
| GET | `/grade-scales` | With bands (active flagged) |
| POST | `/grade-scales` · PUT `/grade-scales/:id` | ADMIN `{ name, bands: [{ minScore, maxScore, letter, gradePoint, remark }] }` — validated for overlap/duplicates |
| POST | `/grade-scales/:id/activate` | ADMIN — the active scale drives all computation |
| DELETE | `/grade-scales/:id` | ADMIN — cannot delete active |

## Grades workflow (`/api/grades`)

State machine: `DRAFT → SUBMITTED → APPROVED → PUBLISHED` (admin may `unlock` backwards for corrections).

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/grades/grid?classId&subjectId&semesterId` | TEACHER*, ADMIN | Mark-entry matrix `{ students, components, entries, status, editable }` |
| GET | `/grades/import/template?classId&subjectId&semesterId` | TEACHER*, ADMIN | `.xlsx` pre-filled with roster (admission no + name), component columns and existing marks |
| POST | `/grades/import?classId&subjectId&semesterId` | TEACHER*, ADMIN | **Bulk marks import** — multipart `{ file }` (.xlsx/.csv). Blank cells keep existing marks; per-cell validation (number, 0–max, known admission no); published/approved lock rules match the grid (admin fixes recompute). Returns `{ applied, skipped, failed, errors[] }` |
| POST | `/grades/entry` | TEACHER*, ADMIN | `{ classId, subjectId, semesterId, entries: [{ studentId, scores: { componentId: number\|null } }] }` — bulk upsert; `null` deletes; locked after approval (admin edits recompute automatically) |
| POST | `/grades/submit` | TEACHER*, ADMIN | DRAFT → SUBMITTED; notifies admins with a `/approvals` deep link |
| GET | `/grades/pending-approvals` | ADMIN | **Approval inbox** — one row per submitted (class, subject, term) grid with marks/students counts, teacher names and timestamps, oldest first |
| POST | `/grades/approve` | ADMIN | SUBMITTED → APPROVED; **auto-computes subject results, subject ranks, GPA & class positions** |
| POST | `/grades/publish` | ADMIN | APPROVED → PUBLISHED; notifies **students + parents** (deep link to `/grades`) |
| POST | `/grades/unlock` | ADMIN | `{ …, to: "APPROVED"\|"SUBMITTED"\|"DRAFT", note? }` — reopen for corrections; `to: "DRAFT"` **returns a submission to the teacher** with an optional note (teacher notified with a `/grade-entry?…` deep link) |
| GET | `/grades/class-summary?classId&semesterId` | TEACHER*, ADMIN | Full class sheet: per-student results + GPA |

\* teachers are restricted to their assigned (class, subject) pairs.

## Analytics

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/analytics/dashboard` | ADMIN, TEACHER | Headline counts, average performance, pending submissions, grade distribution, top/bottom 5 students, recent results, school GPA trend |
| GET | `/analytics/subject-performance?classId&semesterId` | ADMIN, TEACHER | Per-subject average / highest / lowest |
| GET | `/analytics/gpa-trends?studentId` | self/parent/teacher/admin | GPA + position across terms |
| GET | `/analytics/class-performance?semesterId` | ADMIN, TEACHER | Class comparison (avg GPA / score) |

## Report cards

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/report-cards/generate` | ADMIN | `{ classId, semesterId }` — bulk-generate (requires computed GPA) |
| GET | `/report-cards?classId&semesterId` | ADMIN, TEACHER | List with status + verification codes |
| GET | `/report-cards/mine?studentId=` | STUDENT / PARENT | Own (or child's) **published** cards |
| GET | `/report-cards/:id` | owner/admin | Full JSON detail |
| GET | `/report-cards/:id/pdf` | owner/admin | PDF download |
| GET | `/report-cards/transcript/:studentId/pdf` | owner/parent/admin | Cumulative transcript + CGPA |
| GET | `/report-cards/verify/:code` | **PUBLIC** | QR target — card data + QR image, only once published |
| PATCH | `/report-cards/:id/remarks` | ADMIN | `{ teacherRemarks?, principalRemarks? }` (pre-publish) |
| POST | `/report-cards/:id/publish` · `/publish-all` | ADMIN | Publishes + notifies students & parents |

## Digital signatures (TEACHER & ADMIN)

| Method | Path | Notes |
|---|---|---|
| POST | `/signatures/me` | multipart `file` (PNG/JPG/WebP ≤ 5 MB) + optional `title`. Drawn canvases pass through; paper photos are auto-rotated, background-removed, ink-cropped and compressed. Upserts — replaces any previous signature |
| GET | `/signatures/me` | own signature PNG |
| GET | `/signatures/me/meta` | metadata only (id, title, dimensions, updatedAt) |
| GET | `/signatures/user/:userId` | ADMIN — inspect any user's signature |
| DELETE | `/signatures/me` | remove own signature |

Resolved automatically onto report cards: homeroom teacher → *Class Teacher* slot; publishing admin → *Principal* slot. Exposed publicly only on **published** cards via `/report-cards/verify/:code` (`signatures.classTeacher/principal.dataUrl`).

## Reports / exports · Notifications · Admin

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/reports/gradesheet.csv?classId&subjectId&semesterId` | TEACHER*, ADMIN | CSV (opens in Excel) |
| GET | `/reports/class-report.csv?classId&semesterId` | TEACHER*, ADMIN | Class GPA report CSV |
| GET | `/notifications` · PATCH `/notifications/:id/read` · `/read-all` | auth | Latest 30 + unread count; items may carry a `link` used by the UI to deep-link (e.g. approval inbox, grade entry) |
| DELETE | `/notifications/:id` · `/notifications` | auth | Delete one (own only, 404 otherwise) / clear all of the caller's notifications |
| GET | `/admin/audit-logs?entity=&action=&userId=&search=&from=&to=&page=&pageSize=` | ADMIN | Audit trail with filters (search matches action/entity/entity-id/user name) |
| GET | `/admin/audit-logs/meta` | ADMIN | Distinct `actions[]` + `entities[]` for filter dropdowns |
| GET | `/admin/backup` | ADMIN | Full database export (JSON download) |
| GET | `/health` | public | `{ status: "ok" }` |

## Example: complete grading flow

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login \
 -H 'Content-Type: application/json' \
 -d '{"email":"m.habimana@school.rw","password":"Teacher@123"}' | jq -r .accessToken)

# 1. teacher saves marks (draft)
curl -X POST localhost:4000/api/grades/entry \
 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
 -d '{"classId":"…","subjectId":"…","semesterId":"…",
 "entries":[{"studentId":"…","scores":{"<componentId>":87}}]}'

# 2. teacher submits — 3. admin approves (auto-compute) — 4. admin publishes
curl -X POST localhost:4000/api/grades/submit -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"classId":"…","subjectId":"…","semesterId":"…"}'
curl -X POST localhost:4000/api/grades/approve -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"classId":"…","subjectId":"…","semesterId":"…"}'
curl -X POST localhost:4000/api/grades/publish -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"classId":"…","subjectId":"…","semesterId":"…"}'
```
