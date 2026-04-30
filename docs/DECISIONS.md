# KRB School Dashboard v2 — Decisions

This document captures every architectural and product decision made before code was written, with rationale. It is the source of truth for the project. Update it when decisions change; do not let code drift from it silently.

---

## 1. Project context

**What this is:** A multi-tenant, SaaS school management system. v1 (the existing KRB Dashboard, Go + SQLite + vanilla JS) is a single-school product running for one paid client. v2 is a **greenfield rewrite** — no migration from v1.

**Initial customer:** A school in Bhatoya, Pathankot, Punjab, ~600 students. Same client (or his neighbor — confirm before launch).

**Long-term goal:** Onboard multiple schools in the region. Per-school subscription pricing (~₹5/student/month working hypothesis).

**Scope of v1 build:**
- Admin portal (9 pages — A1 through A9)
- Teacher portal (6 pages — T1 through T6)
- Student portal — **deferred**, designed later
- Messaging — **scaffolded but disabled**, see §10

---

## 2. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | Go | Continuity from v1; team knows it; compiles to single binary. |
| Web framework | Fiber v2 | Continuity from v1; lightweight; fits the API-only role. |
| ORM | GORM | Continuity; struct tags for indices; hooks for audit log. |
| Database | **PostgreSQL** | Multi-tenant requires real concurrency, JSONB (for audit log), proper text search. v1's SQLite is not enough. |
| DB driver | `gorm.io/driver/postgres` | Pure Go; works in Alpine without CGO. The glebarez constraint from v1 disappears. |
| Money type | `shopspring/decimal` → Postgres `NUMERIC(10,2)` | Float arithmetic causes silent rounding bugs in production. Non-negotiable. |
| Frontend | **React + Tailwind** | Owner wants better frontend control than v1's vanilla JS. SPA + JSON API. |
| Auth | JWT in **httpOnly cookie** | Safer than localStorage for SPAs. Same-origin in prod via reverse proxy. |
| Deployment | Docker, Alpine base | Continuity from v1. |
| Local dev | docker-compose (Go + Postgres + React dev server) | Postgres makes this heavier than v1; worth it. |

**What changed from v1:**
- SQLite → Postgres
- Server-rendered HTML → React SPA + JSON API
- Single-tenant → multi-tenant (every table has `school_id`)

**What stayed the same:**
- Go + Fiber + GORM
- Docker Alpine deployment
- Pragmatic, ship-first approach

---

## 3. Multi-tenancy

**Strategy:** Shared database, shared schema, `school_id` filter on every query.

**Not chosen:** Schema-per-tenant (operationally heavier; overkill for this scale). Database-per-tenant (way overkill).

**Implementation:**
- Every table has `school_id BIGINT NOT NULL` with an index. (Indexed because every query filters by it.)
- A `TenantScope` GORM scope automatically injects `WHERE school_id = ?` based on the authenticated user's school. Any query that does not go through the scope is a bug.
- A middleware sets the school context from the JWT claims. Routes that need cross-tenant access (none in v1) bypass it explicitly.
- A unique-per-school constraint pattern: `UNIQUE (school_id, X)` instead of `UNIQUE (X)`. Two schools can have a student with admission_no "0001".

**Subdomain routing:** Each school gets a subdomain like `krb.app.com`. The subdomain → `school.code` lookup happens before auth. The login form is then `(username, password)` (school is implied by URL), not `(school_code, username, password)`.

**For local dev:** subdomain emulation via `/etc/hosts` or a wildcard cert; or fall back to a `?school=krb` query param in development mode only.

---

## 4. Schema overview

Full schema in `migrations/001_initial_schema.sql` and `internal/models/`. Key shape:

**Core entities:** `School`, `AcademicYear`, `Student`, `Teacher`, `User`, `Class`, `ClassYear`, `Enrollment`.

**Money trail:** `Fee` → `Payment` (1:N for partial payments).

**Academics:** `Homework`, `Notice`, `Exam`, `Result`, plus `HomeworkTarget` and `NoticeTarget` join tables for multi-class targeting.

**Operational:** `AuditLog`, `ReceiptCounter`. `SmsTemplate` and `SmsLog` exist as stubs.

### Class-year modeling — Option B (Class + ClassYear)

`Class` is permanent. One row per `(school, number, section)` for the school's lifetime.
`ClassYear` is per-year. New row per academic year, holds class teacher and fees.
`Enrollment` references `ClassYear` (and via it, the academic year and class).

**Why:** Class identity is stable across years (5-A is 5-A in 2025-26 and 2026-27). Year-varying facts (teacher, fees) belong on a separate row. Cleaner queries for "5-A across all time" and "who taught 5-A in 2024-25." One extra join per roster query — negligible at scale.

### Identity on Student

- `admission_no` — school's permanent ID. Required. Unique per school.
- `epunjab_id` — government ID. Nullable (private schools won't have it). Unique per school **when present**.

Both fields together let fees survive student record changes.

### Fee math — `net_amount` is computed

`Fee` stores `amount` and `discount`. `net_amount` is **not** stored — computed in queries as `amount - discount` (or via a Postgres generated column if convenient). Decision: don't use the generated column; compute in queries. Reason: simpler GORM model, one less Postgres-specific feature to depend on.

### Payments — append-only with status

`Payment` has `status` (`completed` | `reversed` | `refunded`) and `reversed_at` / `reversal_reason` fields. Never deleted, never updated except to mark reversed. Fee's paid amount = `SUM(amount) WHERE status='completed'`.

### Soft-delete policy

| Table | Policy |
|---|---|
| Student | `is_active` flag. Not soft-deleted. Leaving = `is_active=false` + `Enrollment.status='left'`. |
| Teacher | `is_active` flag. Not soft-deleted. |
| Enrollment | Has `status` (active/promoted/left), `left_on`, `left_reason`. Not deleted. |
| Class, ClassYear | `gorm.DeletedAt`. Soft-delete OK because they may be created in error. |
| Fee | Never deleted. |
| Payment | Never deleted. Status field handles reversals. |
| Notice, Homework | `gorm.DeletedAt`. |
| AuditLog | Never deleted. Append-only by definition. |

### Notice/Homework targeting — many-to-many via join tables

`Notice` has a `target_all_school` boolean. If true, no `notice_target` rows; everyone in the school sees it. If false, `notice_target` rows specify which classes.

`Homework` has the same structure via `homework_target`. A teacher who teaches the same subject to 3-A and 4-A can post one homework targeting both.

---

## 5. Authentication & authorization

**Login:** JWT in httpOnly, secure, sameSite=strict cookie. 7-day expiry, refresh on use.

**User table:** Each `User` has `school_id`, `username`, `password_hash` (bcrypt), `role`, and nullable FKs to `Teacher` or `Student`. Username is unique **per school**.

**Roles:** `admin`, `teacher`, `student`. Permissions enforced at the handler level via middleware. Examples:
- A teacher can only post notices to classes they teach (joined via class_year.class_teacher_id and any subject teaching assignments).
- A teacher can only enter marks for exams assigned to them.
- A student can only see their own data.

**Parents:** Out of scope for v1. Parents are reached via SMS only. Reason: parents won't realistically log in; SMS is one-way and good enough.

**Password reset in v1:** Admin resets passwords manually from the Settings page. Self-service email reset deferred.

---

## 6. Receipt number generation

**Format (default):** `{code}/{yy}-{yy_next}/{seq:0000}` → `KRB/25-26/0001`.

**Reset cadence (default):** Yearly on April 1.

**Configurable per school:** Yes. The format string and reset cadence are stored on the `School` row, not hardcoded. Owner can change either from the Settings page; new format applies to subsequent receipts only (already-issued receipts keep their numbers, as on paper).

**Fields on School:**
- `receipt_format VARCHAR` — template string. Default: `{code}/{yy}-{yy_next}/{seq:0000}`. Variables: `{code}`, `{yy}`, `{yy_next}`, `{yyyy}`, `{mm}`, `{seq:NNNN}` where NNNN is zero-padding.
- `receipt_reset VARCHAR` — `yearly` | `continuous` | `monthly`. Default: `yearly`.
- `receipt_starting_num INTEGER` — default 1. For schools migrating from a paper book, set to (last_paper_receipt + 1).

**Counter:** `ReceiptCounter` table, keyed `(school_id, period_key)`. `period_key` is `"25-26"` for yearly, `"continuous"` for never-reset, `"2026-04"` for monthly. Generation happens inside the same DB transaction as the Payment insert, with row-level lock — concurrent receipts can't collide.

**Why this format:** Matches the handwritten receipt-book format Indian schools (especially in Punjab) already use. Recognizable to parents and auditors. Mental model maps to the existing manual workflow, easing onboarding.

**Ruled out:** Random/UUID (looks fake), date-only (mismatches academic-year mental model), Postgres SEQUENCE (not per-school-per-year).

---

## 7. Audit log

**Why:** Fee disputes are inevitable. Without a record of "who changed what when," resolution becomes a fight. With one, it's a 2-minute lookup.

**Schema:**
```
audit_log
  id, school_id, user_id, action, entity_type, entity_id,
  before (jsonb), after (jsonb), reason, created_at
```

`before`/`after` store JSON snapshots. JSONB allows querying into history later.

**Implementation:** A GORM hook (`AfterCreate`, `AfterUpdate`, soft-delete equivalents) on the entities below. ~50 lines of shared code, applies to:
- Fee (every change)
- Payment (creation, reversal)
- Enrollment (creation, status change)
- Student (any field change — sensitive)
- Teacher (any field change)
- Class, ClassYear (any change to fees/teacher)

**Skip:** Read-only queries. Login attempts (use a separate auth log if needed later). Notice/Homework (low audit value; they have edit timestamps already).

**Retention:** Forever. No deletion. Storage is negligible.

---

## 8. Indices

GORM struct tags create indices via auto-migrate. Definitive list lives in the model files; high-level rationale here.

- **Every `school_id`** — used on every query. Without it, queries scan all tenants' data.
- **Foreign-key columns** — Postgres does not auto-index FKs (unlike MySQL). Every FK gets a manual index.
- **Composite indices on hot paths:**
  - `(school_id, is_active)` on Student — list-active-students query (dashboard, students page)
  - `(class_year_id, status)` on Enrollment — class roster query
  - `(enrollment_id, status)` on Fee — pending-fees-for-student query (dashboard)
  - `(school_id, paid_at)` on Payment — recent payments dashboard widget
  - `(school_id, username)` on User — login lookup
- **Unique constraints (which double as indices):**
  - `Student.admission_no` per school
  - `Student.epunjab_id` per school (where not null)
  - `Payment.receipt_no` per school
  - `Enrollment(student_id, academic_year_id)`
  - `Fee(enrollment_id, fee_type, month)`
  - `Result(exam_id, enrollment_id)`
  - `User.username` per school

**Trade-off accepted:** Indices slow writes very slightly. Reads vastly outnumber writes; clear win.

**At-scale validation:** Schema verified to scale to 50K students across many schools without modification. Hot queries hit O(log N) lookups via these indices.

---

## 9. Money handling

Every monetary field is `NUMERIC(10,2)` in Postgres, `decimal.Decimal` in Go (via `github.com/shopspring/decimal`).

**Never:** `float64`, `float32`, `int` (paise/cents). The decimal library handles everything correctly.

**JSON serialization:** Decimal serializes as a string (`"800.00"`), not a number. The React frontend treats fee amounts as strings until rendering — never `parseFloat`. Render with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.

---

## 10. Messaging — scaffolded, disabled

**Why on hold:** Indian DLT (Distributed Ledger Technology) registration is required for transactional SMS to Indian numbers since 2020. Process:
1. School registers as Principal Entity on a DLT portal (Jio is most common).
2. Sender ID (6-char header like `KRBSCH`) registered.
3. Every SMS template pre-registered with placeholder variables.
4. Provider connection (MSG91 or Fast2SMS recommended for India).

This is paperwork, not code. Holding off until the school owner is ready.

**What we build now:**
- `SmsTemplate` table — `(school_id, name, dlt_template_id, content, variables)`. Content is the template with placeholders like `Dear {parent_name}, fee for {month} of ₹{amount} is due.`
- `SmsLog` table — every send attempt with status (queued/sent/failed/delivered), provider response, cost.
- API endpoints stubbed but disabled. Frontend pages from A8 wireframes built but read-only or hidden behind a feature flag.

**When activated:** Plug in MSG91 provider, populate templates, flip the feature flag. No schema changes.

**Cost note for pricing:** ~₹0.20/SMS at volume. 600 students × 4 SMS/month average = ~₹480/month per school. Affects the ₹5/student pricing model — verify at activation time.

---

## 11. Out of scope for v1

Explicitly **not** in v1:
- Attendance tracking
- Student portal (deferred — design after admin/teacher ship)
- Parent accounts (SMS instead)
- Self-service password reset (admin resets manually)
- File uploads beyond profile photos and the school logo
- Library, transport route management, cafeteria, hostel — not requested
- Multi-language UI — English only for v1
- Email notifications — SMS only when messaging activates
- Mobile app — web responsive only

These can be added in v1.x or v2 based on customer demand. Schema is forward-compatible (e.g., adding Attendance is a new table, no changes to existing ones).

---

## 12. Operational decisions

**Background jobs:** Monthly fee generation (creating Fee rows for every active enrollment on the 1st of each month) runs as a job, not an HTTP request. v1 implementation: a cron-style goroutine inside the same Go process, triggered by an in-process scheduler. Acceptable up to ~10K students. Beyond that: pull out to a separate worker. Not a v1 concern.

**Backups:** Postgres `pg_dump` nightly to encrypted off-host storage. Not built into the app — handled at the deployment layer (cron + S3-compatible object store). Document the procedure in `docs/OPS.md` (to be written during deployment).

**Logging:** Structured JSON logs via `slog`. Log to stdout; aggregation via the host (Docker logs → wherever).

**Error tracking:** Out of scope for v1. Add Sentry or equivalent post-launch.

**Rate limiting:** Per-IP rate limit on auth endpoints (login, password reset) via Fiber middleware. No general API rate limiting in v1.

**HTTPS:** Terminated at reverse proxy (Caddy or Nginx). Go binary speaks HTTP locally.

---

## 13. What we did not decide

These deliberately remain open and will be decided when needed:

- Specific SMS provider (MSG91 vs Fast2SMS vs Twilio) — at messaging activation.
- Mobile app — defer until web is proven with a paying customer.
- Multi-language UI — defer until a non-English-speaking school onboards.
- Whether to keep deferred student portal as part of v1 or call it v1.1 — depends on launch timeline.
- Pricing for additional schools beyond the first — depends on customer feedback.

---

## Change log

- **2026-04-27** — Initial decisions captured. All §1–§13 finalized.
