# Backend Security, Correctness, and Performance Review

Date: 2026-06-02

Scope: `api/`, including the in-progress teacher portal changes currently present
in the working tree. This document is review-only. No application-code fixes are
included.

## Verification Performed

- `GOCACHE=/tmp/lms-go-build go test ./...`
  - Passes compilation.
  - Every package reports `[no test files]`; there is currently no backend test
    coverage.
- `GOCACHE=/tmp/lms-go-build go vet ./...`
  - Passes.
- `go run golang.org/x/vuln/cmd/govulncheck@latest ./...`
  - Reports 9 reachable standard-library vulnerabilities with the installed Go
    `1.26.0`. Upgrade to at least Go `1.26.3`.
  - Also reports vulnerabilities in imported/required modules that do not appear
    reachable from current code. Re-run after upgrading Go and dependencies.
- `staticcheck ./...`
  - Could not run: the locally installed `staticcheck` binary was built with Go
    `1.24.6`, while this module requires at least Go `1.25.0`.

## Recommended Fix Order

1. Rotate committed secrets and fix JWT validation.
2. Fix authorization and tenant-boundary defects.
3. Add integration tests for the critical paths.
4. Introduce real versioned migrations before deploying teacher assignments.
5. Upgrade Go and re-run `govulncheck`.
6. Apply query and indexing improvements using production-like benchmarks.

## Critical Findings

### SEC-01: Secrets are committed to Git history

`api/.env` is tracked by Git and appears in existing commits. It contains
database credentials and `JWT_SECRET`. The root `.gitignore` does not protect a
file that is already tracked.

Recommended change:

- Rotate the database credentials and `JWT_SECRET` immediately.
- Treat existing JWTs as compromised and invalidate them.
- Remove `api/.env` from tracking while keeping a redacted `.env.example`.
- If the repository has been shared, purge the file from Git history using an
  agreed history-rewrite procedure.
- Use a secret manager or deployment environment variables outside development.

### SEC-02: Missing `JWT_SECRET` allows forged administrator tokens

Reference: `api/internal/middleware/auth.go:21`

The middleware reads `JWT_SECRET` without checking that it exists. If the
environment variable is absent, verification uses an empty HMAC key. An attacker
can sign a token with the same empty key and choose arbitrary claims including
`role`, `school_id`, and `user_id`.

The middleware also permits any HMAC signing method, although token generation
uses HS256.

Recommended change:

- Validate configuration once during startup and refuse to start when
  `JWT_SECRET` is missing or too short. For HS256, require a high-entropy secret
  of at least 32 bytes.
- Restrict parsing to exactly `HS256` with `jwt.WithValidMethods`.
- Add tests for missing secret, wrong algorithm, invalid signature, expiry, and
  valid tokens.

## High-Severity Findings

### SEC-03: All new and reset accounts share the password `123456`

References:

- `api/internal/auth/constants.go:3`
- `api/internal/handlers/students.go:279`
- `api/internal/handlers/teachers.go:171`
- `api/internal/handlers/auth.go:132`

Every teacher and student account starts with the same six-digit password.
Password reset restores the same shared value. There is no forced first-login
change. This conflicts with the change-password endpoint's own eight-character
minimum.

Recommended change:

- Generate a cryptographically random temporary password per account/reset.
- Return it once to the administrator and require a password change on first
  login.
- Store a `must_change_password` flag.
- Add a maximum password length appropriate for bcrypt input handling.

### SEC-04: Deactivation and password changes do not revoke existing JWTs

References:

- `api/internal/middleware/auth.go:24`
- `api/internal/handlers/users.go:130`
- `api/internal/handlers/auth.go:115`

Authenticated requests trust signed claims for up to seven days without checking
current account state. A user whose account is deactivated, or whose password is
reset after suspected compromise, can continue using an already-issued token.

Recommended change:

- Add a `token_version` or `session_version` column to users and include it in
  JWT claims.
- Increment it on password change, reset, and deactivation.
- Validate account activity and token version for authenticated requests. Use a
  short-lived cache if a DB lookup per request is too expensive.
- Consider shorter access-token lifetimes plus refresh-token rotation.

### AUTHZ-01: A teacher can update another teacher's exam

Reference: `api/internal/handlers/exams.go:260`

`ExamsHandler.Update` loads the exam by school but never checks ownership for a
teacher request. Any teacher in the school can modify another teacher's exam,
including its subject, marks limit, and assigned teacher.

Recommended change:

- For teachers, return not found unless `exam.teacher_id` matches the JWT
  `teacher_id`.
- Do not allow teachers to reassign `teacher_id`; reserve reassignment for admin.
- Add a regression test with two teachers in the same school.

### AUTHZ-02: Teachers can publish homework to any class in their school

Reference: `api/internal/handlers/homeworks.go:360`

The handler validates only that target class years belong to the school. It does
not verify that a teacher owns or teaches those class years. The frontend picker
is not an authorization boundary.

Recommended change:

- Pass teacher context into target validation.
- Reject teacher targets outside the active set returned by
  `teacherClassYearIDs`.
- Add create and update tests for unauthorized same-school classes.

### AUTHZ-03: Teachers can publish notices school-wide or to unrelated classes

Reference: `api/internal/handlers/notices.go:358`

Teachers can submit `target_all_school=true` and can target any class year in
their school. The UI hides these choices but the API accepts them.

Recommended change:

- Decide policy explicitly. A conservative default is: only admins may publish
  school-wide notices; teachers may target only classes they own or teach.
- Enforce the same rule in both create and update handlers.

### DATA-01: Exam results accept students outside the exam class

Reference: `api/internal/handlers/exams.go:448`

Result entry checks only that enrollment IDs belong to the school. It does not
require each enrollment to belong to `exam.class_year_id`. This allows marks to
be written against unrelated students. The student's portal can then expose an
exam from a different class through that incorrect result row.

Recommended change:

- Validate enrollment IDs with both `school_id` and
  `class_year_id = exam.class_year_id`.
- Add a composite integrity check at the service layer and regression tests.

### DATA-02: Assessment marks accept students outside the exam class

Reference: `api/internal/handlers/assessments.go:314`

Assessment mark entry has the same issue as exam results: it validates school
membership only. It must load the assessment's exam and constrain enrollments to
that exam's class year.

Recommended change:

- Validate `enrollments.class_year_id = exams.class_year_id` through the
  assessment's `exam_id`.
- Add tests for unrelated enrollments in the same school and another school.

### DATA-03: Student creation permits cross-school class-year references

Reference: `api/internal/handlers/students.go:324`

Student creation accepts `class_year_id` and inserts an enrollment without
verifying that the class year belongs to the JWT school. The database foreign key
checks that the class year exists, but not that tenant IDs match.

Recommended change:

- Validate that the class year is active and belongs to the current school
  before creating the student.
- Add composite tenant-aware foreign keys where practical; see `SCHEMA-02`.

### DEPLOY-01: Existing databases will not receive the teacher-assignment schema

References:

- `api/cmd/migration/main.go:25`
- `api/migrations/001_initial_schema.sql:149`

The migration runner executes every SQL file directly and has no migration
tracking table. The new `teaching_assignments` table was added by modifying
`001_initial_schema.sql`. A fresh database receives it, but an existing database
cannot safely rerun `001_initial_schema.sql` because earlier `CREATE TABLE`
statements already exist.

Recommended change:

- Adopt a versioned migration tool or add a schema-migrations table.
- Leave `001_initial_schema.sql` immutable for established environments.
- Add a separate `002_teaching_assignments.sql`.
- Test migration from the currently deployed schema and from an empty database.

### DEP-01: Installed Go version has reachable vulnerabilities

`govulncheck` reports the following reachable standard-library advisories with Go
`1.26.0`:

- `GO-2026-4971`
- `GO-2026-4947`
- `GO-2026-4946`
- `GO-2026-4870`
- `GO-2026-4866`
- `GO-2026-4602`
- `GO-2026-4601`
- `GO-2026-4600`
- `GO-2026-4599`

Recommended change:

- Upgrade the Go toolchain to at least `1.26.3`.
- Rebuild all deployed binaries and containers.
- Re-run `govulncheck ./...` after upgrading dependencies.

## Medium-Severity Findings

### DATA-04: Promotion can leave a student active in both classes

Reference: `api/internal/handlers/enrollments.go:290`

When a target enrollment already exists, promotion increments `skippedCount` and
continues without marking the source enrollment as promoted. A student can
remain active in both source and target classes.

Recommended change:

- Define behavior for an existing active, inactive, or historical target row.
- At minimum, close the active source enrollment when an active target already
  exists.
- Consider a partial unique index enforcing one active enrollment per student if
  that matches the business rule.

### AUTHZ-04: Teachers can transfer assessment ownership

Reference: `api/internal/handlers/assessments.go:186`

A teacher who owns an assessment can set `teacher_id` to any teacher in the same
school. Reassignment should be admin-only unless this is an explicit workflow.

Recommended change:

- Ignore or reject teacher-supplied `teacher_id` updates.
- Keep reassignment admin-only and test it.

### DATA-05: `epunjab_id` duplicates are allowed despite handler messaging

References:

- `api/migrations/001_initial_schema.sql:66`
- `api/internal/models/student.go:9`
- `api/internal/handlers/students.go:335`

The handler reports that `epunjab_id` may already exist, but neither the schema
nor model defines a uniqueness constraint for it.

Recommended change:

- Confirm whether uniqueness is per school or global.
- Add the matching unique index, preferably partial so multiple nulls remain
  valid.

### AUTHZ-05: Subject-teacher class visibility is inconsistent

References:

- `api/internal/handlers/permissions.go:19`
- `api/internal/handlers/class_years.go:61`
- `api/internal/handlers/exams.go:227`

Enrollment reads recognize both class-teacher ownership and subject-teaching
assignments. Class-year reads and teacher exam creation still use class-teacher
ownership only. A subject teacher may see a roster but be unable to fetch its
class year or create an exam for the assigned subject.

Recommended change:

- Define capabilities for class teachers versus subject teachers.
- Apply one centralized policy consistently across class years, enrollments,
  homework, notices, exams, and assessments.
- Consider validating the subject as well as the class-year assignment.

### FILE-01: Library path containment checks use an unsafe prefix comparison

References:

- `api/internal/handlers/library.go:237`
- `api/internal/handlers/student_portal.go:336`

`strings.HasPrefix(absPath, absBase)` is not a path-boundary check. A sibling
path such as `/uploads/library-other/...` also passes. Uploads currently generate
UUID paths, so exploitation requires a tampered or legacy DB row, but download
and delete should still be hardened.

The delete path does not perform any containment check before `os.Remove`.

Recommended change:

- Centralize stored-file resolution in one helper.
- Use `filepath.Rel` and reject absolute paths plus `..` traversal.
- Apply the helper to admin/teacher download, student download, and delete.
- Consider `os.OpenRoot` on supported Go versions.

### FILE-02: Upload validation and download filename handling need hardening

References:

- `api/internal/handlers/library.go:158`
- `api/internal/handlers/library.go:248`
- `api/internal/handlers/library.go:285`

The PDF check only verifies extension and the first five bytes. The comment says
content type is checked, but it is not. Download filename sanitization removes
quotes and slashes but does not explicitly remove control characters.

Recommended change:

- Sniff media type and optionally parse PDFs before accepting them.
- Add malware scanning if uploads cross trust boundaries.
- Strip control characters and build `Content-Disposition` with
  `mime.FormatMediaType`.

### DB-01: Database TLS is hard-disabled

Reference: `api/internal/database/database.go:14`

`sslmode=disable` is fixed in code. This exposes database traffic if Postgres is
not strictly local or inside a trusted private network.

Recommended change:

- Configure SSL mode through environment variables.
- Require certificate verification in production.

### OPS-01: Some database failures are silently ignored

Examples:

- `api/internal/handlers/auth.go:56`
- `api/internal/handlers/auth.go:115`
- `api/internal/handlers/auth.go:156`
- `api/internal/handlers/teacher_dashboard.go:115`
- `api/internal/handlers/dashboard.go:66`

Password updates can report success even if the database write fails. Dashboard
and enrichment queries can silently return incomplete data. The teacher
dashboard also converts any current-year DB error into an empty dashboard.

Recommended change:

- Check `.Error` for every important query and mutation.
- Distinguish `gorm.ErrRecordNotFound` from operational failures.
- Return an error for outages instead of an apparently valid empty dashboard.

### OPS-02: Browser class reorder fails CORS preflight

Reference: `api/internal/app/app.go:33`

The API registers `PATCH /api/classes/reorder`, but CORS allows only GET, POST,
PUT, DELETE, and OPTIONS.

Recommended change:

- Add `PATCH` to allowed methods.
- Move allowed origins to environment configuration for deployed frontends.

### SCHEMA-01: Library SQL nullability disagrees with the Go model

References:

- `api/migrations/001_initial_schema.sql:396`
- `api/internal/models/library.go:8`

SQL allows `uploaded_by_id` and `academic_year_id` to become null through
`ON DELETE SET NULL`; the model uses non-pointer `uint` fields and declares them
not null. A null row can scan incorrectly or become indistinguishable from ID
zero.

Recommended change:

- Decide whether historical library rows survive deletion.
- Make both SQL and Go types agree: nullable pointer fields, or `NOT NULL` with a
  suitable delete policy.

### SCHEMA-02: Tenant consistency depends too heavily on handlers

Reference: `api/migrations/001_initial_schema.sql`

Many tables repeat `school_id` while their foreign keys validate only the target
row ID. A row can claim school A while referencing a school B class year,
enrollment, exam, or user if a handler misses validation. `DATA-03` is one
confirmed example.

Recommended change:

- Add composite unique keys such as `(id, school_id)` to tenant-owned parent
  tables and composite foreign keys from child tables.
- Keep handler checks for clear API errors, but enforce invariants in Postgres.
- Add cross-tenant integration tests for every write endpoint.

### SCHEMA-03: User role and linked-profile invariants are incomplete

Reference: `api/migrations/001_initial_schema.sql:94`

The schema does not restrict role values or enforce that teacher users have a
teacher link, student users have a student link, and linked profiles are unique.

Recommended change:

- Add a role check constraint.
- Add partial unique indexes for non-null `teacher_id` and `student_id`.
- Add role/link consistency checks or enforce them in a transaction-safe service.

### OPS-03: Add panic recovery and explicit server limits

Reference: `api/internal/server/http.go:15`

The server config sets an upload-friendly body limit but does not register Fiber
panic recovery or explicit timeouts. A panic can terminate request handling
poorly, and slow clients can retain resources longer than intended.

Recommended change:

- Add Fiber recovery middleware.
- Configure read, write, idle, and header limits appropriate for deployment.
- Keep upload limits route-specific where possible.

## Performance Review

### PERF-01: Fee generation is query-heavy

Reference: `api/internal/services/feegen.go:43`

Monthly fee generation performs one enrollment query per class year and up to two
individual inserts per student. At school scale this produces thousands of
round-trips inside one transaction.

Recommended change:

- Replace loops with bulk `INSERT ... SELECT ... ON CONFLICT DO NOTHING`
  statements for tuition and transport.
- Measure transaction duration with production-like enrollment counts.

### PERF-02: Configure the SQL connection pool

Reference: `api/internal/database/database.go:22`

The app opens GORM but does not configure the underlying `sql.DB`. Defaults may
create too many connections under load and leave stale connections around.

Recommended change:

- Set `MaxOpenConns`, `MaxIdleConns`, `ConnMaxLifetime`, and
  `ConnMaxIdleTime` from environment-backed configuration.
- Export pool metrics.

### PERF-03: Add bounded pagination consistently

Several growing list endpoints are unbounded, including teachers, users,
classes, class years, notices, homework, exams, library, and student portal
history endpoints.

Recommended change:

- Introduce a shared pagination parser with defaults and a maximum page size.
- Prefer cursor pagination for high-volume ordered feeds such as notices,
  payments, and homework.
- Make total counts optional where the UI does not need them.

### PERF-04: Consolidate dashboard round-trips

References:

- `api/internal/handlers/dashboard.go:45`
- `api/internal/handlers/teacher_dashboard.go:88`

The admin and teacher dashboards execute many independent queries sequentially.
The teacher dashboard can exceed ten round-trips for one request.

Recommended change:

- Combine compatible aggregates with conditional SQL, CTEs, or purpose-built
  dashboard queries.
- Run truly independent queries concurrently only after the DB pool is bounded.
- Check every query error so optimization does not hide failures.

### PERF-05: Replace portal `pluck IDs -> IN (...)` patterns with joins

Reference: `api/internal/handlers/student_portal.go:104`

Student portal endpoints repeatedly fetch enrollment IDs and then issue another
query with an `IN` list. This adds round-trips and creates large SQL argument
lists for long enrollment histories.

Recommended change:

- Join through `enrollments` and filter by `student_id` plus `school_id` in one
  query for fees, results, marks, and fee payments.

### PERF-06: Extract shared query helpers

The backend repeats several concepts:

- Current academic year lookup.
- Class-year label lookup (`name-section`).
- Teacher class-year authorization.
- Library stored-path resolution.
- Pagination parsing.
- Batched display-name resolution.

Recommended change:

- Extract small shared helpers or repository methods only for these repeated
  operations.
- Keep tenant scoping inside each helper so callers cannot forget it.
- Return errors from permission helpers instead of treating DB failures as
  ordinary denial.

### PERF-07: Benchmark and add targeted indexes

Use `EXPLAIN (ANALYZE, BUFFERS)` with realistic data before adding indexes.
Likely candidates based on current query shapes:

- `fees (school_id, status, due_date)`
- `payments (school_id, status, paid_at DESC)`
- `homeworks (school_id, teacher_id, is_active, due_date DESC)`
- `notices (school_id, posted_by_id, is_active, created_at DESC)`
- `class_years (school_id, class_teacher_id, is_active)`
- `teaching_assignments (school_id, teacher_id, is_active, class_year_id)`

Student search uses leading-wildcard `ILIKE` across several columns at
`api/internal/handlers/students.go:188`. If it becomes slow, evaluate Postgres
`pg_trgm` GIN indexes or a dedicated normalized search column.

## Test Coverage To Add First

Use integration tests against PostgreSQL because tenant constraints, Postgres
indexes, and SQL behavior matter here.

1. JWT validation with missing secret, wrong algorithm, invalid signature,
   expired token, deactivated user, and rotated session version.
2. Cross-school writes for student creation, class years, marks, results, fees,
   payments, library, and teaching assignments.
3. Two-teacher authorization tests for exam update, homework targets, notice
   targets, notice school-wide publishing, and assessment reassignment.
4. Result and assessment-mark roster tests using an unrelated same-school class.
5. Promotion tests where the target enrollment already exists.
6. Migration tests from an empty database and the last deployed schema.
7. Library path traversal, malformed PDF, oversized upload, and filename-header
   tests.
8. CORS preflight for `PATCH /api/classes/reorder`.

