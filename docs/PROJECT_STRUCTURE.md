# KRB School Dashboard v2 — Project Structure

This document describes the monorepo layout for v2. Hand this to Claude Code along with `DECISIONS.md` and the schema files; it has enough detail to bootstrap the repo without further questions.

---

## Top-level layout

```
krb-v2/
├── README.md                    # quick start, contributor guide
├── docs/
│   ├── DECISIONS.md             # source of truth for decisions
│   ├── PROJECT_STRUCTURE.md     # this file
│   └── OPS.md                   # deployment, backups (written at deploy time)
├── docker-compose.yml           # local dev: api + postgres + web
├── Makefile                     # common commands: make dev, make migrate, make seed
├── .env.example                 # template for required env vars
├── .gitignore
│
├── api/                         # Go backend
│   ├── go.mod
│   ├── go.sum
│   ├── cmd/
│   │   ├── server/
│   │   │   └── main.go          # HTTP server entrypoint
│   │   ├── migrate/
│   │   │   └── main.go          # runs SQL migrations from migrations/
│   │   └── seed/
│   │       └── main.go          # seeds dev data (one school, students, etc.)
│   ├── internal/
│   │   ├── models/              # GORM models (see models.go)
│   │   ├── tenancy/             # TenantScope GORM scope + middleware
│   │   ├── auth/                # JWT, bcrypt, role middleware
│   │   ├── handlers/            # HTTP handlers, grouped by resource
│   │   │   ├── auth.go
│   │   │   ├── students.go
│   │   │   ├── classes.go
│   │   │   ├── fees.go
│   │   │   ├── payments.go
│   │   │   ├── teachers.go
│   │   │   ├── notices.go
│   │   │   ├── homeworks.go
│   │   │   ├── exams.go
│   │   │   ├── results.go
│   │   │   ├── messages.go      # stubs for v1
│   │   │   └── settings.go
│   │   ├── services/            # business logic that doesn't fit in handlers
│   │   │   ├── receipts/        # receipt number generation
│   │   │   ├── feegen/          # monthly fee generation job
│   │   │   ├── audit/           # audit-log GORM hooks
│   │   │   └── sms/             # SMS provider abstraction (disabled)
│   │   ├── db/                  # gorm.DB setup, connection pooling
│   │   ├── config/              # env-var loading
│   │   └── apperr/              # typed errors, HTTP error mapping
│   ├── migrations/              # SQL migrations, sequenced
│   │   └── 001_initial_schema.sql
│   └── tests/                   # integration tests (handler-level)
│
├── web/                         # React frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── index.html
│   ├── public/
│   └── src/
│       ├── main.tsx             # entry
│       ├── App.tsx              # router root
│       ├── api/                 # fetch client, typed endpoints
│       │   ├── client.ts        # base fetch wrapper, auth handling
│       │   ├── students.ts
│       │   ├── fees.ts
│       │   └── ...
│       ├── auth/                # auth context, login/logout
│       ├── components/          # shared UI components
│       │   ├── ui/              # buttons, inputs, modals, table
│       │   └── layout/          # sidebar, header, page shell
│       ├── pages/
│       │   ├── admin/           # A1-A9
│       │   │   ├── Dashboard.tsx
│       │   │   ├── Classes.tsx
│       │   │   ├── Students.tsx
│       │   │   ├── StudentDetail.tsx
│       │   │   ├── Fees.tsx
│       │   │   ├── Teachers.tsx
│       │   │   ├── Notices.tsx
│       │   │   ├── Exams.tsx
│       │   │   ├── Messages.tsx
│       │   │   └── Settings.tsx
│       │   ├── teacher/         # T1-T6
│       │   │   ├── Dashboard.tsx
│       │   │   ├── MyClasses.tsx
│       │   │   ├── Homework.tsx
│       │   │   ├── MarksEntry.tsx
│       │   │   ├── Notices.tsx
│       │   │   └── Messages.tsx
│       │   └── auth/
│       │       └── Login.tsx
│       ├── hooks/
│       └── utils/
│           ├── currency.ts      # Intl.NumberFormat for INR
│           └── date.ts
│
└── deploy/
    ├── Dockerfile.api           # multi-stage Go build, Alpine final
    ├── Dockerfile.web           # multi-stage Node build, nginx final
    └── caddy/                   # reverse proxy config for prod
        └── Caddyfile
```

---

## Why this layout

**Monorepo over split repos.** Single source of truth, atomic PRs across api+web, simpler CI. The `api/` and `web/` boundaries are clear enough that you don't need separate repos for clarity.

**`api/internal/`** — Go's `internal` keyword prevents accidental imports from outside the api directory. Standard pattern.

**`handlers/` thin, `services/` thick.** Handlers parse the request, call a service, return the response. Services hold the business logic. This makes services testable without HTTP machinery.

**Migrations as raw SQL, not GORM auto-migrate.** GORM's auto-migrate is fine for greenfield dev but produces unpredictable diffs when schemas evolve. Raw SQL files numbered `001_`, `002_`, etc. give you reviewable migrations and a clean upgrade path. The GORM models in `models/` describe the *shape*; the SQL file is what actually runs.

**`web/` as a separate Vite + React app.** Standard React+TS+Vite+Tailwind setup. No SSR (overkill for an admin tool). API calls go to `/api/*`; reverse proxy routes appropriately in production.

**`deploy/` separate from app code.** Two Dockerfiles (api and web), each multi-stage. In production, both run behind one Caddy instance that handles HTTPS, subdomains, and routing.

---

## Local development

```bash
# First-time setup
cp .env.example .env
docker-compose up -d postgres
make migrate   # runs api/cmd/migrate
make seed      # creates dev school "krb" with sample data

# Daily work — two terminals
make api       # cd api && go run ./cmd/server
make web       # cd web && npm run dev
```

`docker-compose.yml` only runs Postgres in dev — the Go binary and Vite dev server run on the host for fast reload. Production runs everything in containers.

**Subdomain in dev:** Vite proxies `/api` to `localhost:8080`. The API reads the school code from a `?school=krb` query param when running in dev mode (set via `APP_ENV=development`). In prod, school code comes from the subdomain header.

---

## Environment variables

`.env.example` (committed) and `.env` (gitignored):

```
APP_ENV=development              # development | production
DATABASE_URL=postgres://krb:krb@localhost:5432/krb_dev?sslmode=disable
JWT_SECRET=change-me-32-bytes-min
JWT_TTL_HOURS=168                # 7 days
COOKIE_DOMAIN=                   # blank in dev; ".app.com" in prod
PORT=8080

# Messaging — disabled in v1, populated when activated
SMS_PROVIDER=
SMS_API_KEY=
SMS_SENDER_ID=
```

---

## What Claude Code should build first

Suggested sequence — each step is end-to-end before the next:

1. **Repo bootstrap.** Create the folder structure above, `go.mod`, `package.json`, `docker-compose.yml`, `.env.example`, Makefile.
2. **DB connection + migrations.** `cmd/migrate/main.go` reads SQL files from `migrations/` and applies them in order. Verify the schema lands.
3. **Models + tenancy scope.** Drop in `internal/models/models.go`; build the `TenantScope` and a middleware that puts `school_id` in the request context.
4. **Auth.** Login handler, JWT cookie, bcrypt, auth middleware. Seed an admin user. Verify login works end-to-end via curl.
5. **First admin page end-to-end (Students list).** Handler → service → DB query (with tenancy scope) → JSON. React page → fetch → render. This establishes the pattern for every subsequent page.
6. **Audit log hooks.** Add the GORM hook on Fee/Payment/Enrollment/Student/Teacher/Class/ClassYear. Verify entries appear when a row changes.
7. **Receipt number generation.** Service that reads School config, locks ReceiptCounter, generates the next number. Used by Payment creation.
8. **Crank through the rest of the admin pages** (Classes, Fees, Teachers, Notices, Exams, Messages stub, Settings). Each follows the pattern from step 5.
9. **Teacher pages T1–T6.** Permission middleware first (a teacher can only access their classes), then the pages.
10. **Monthly fee generation job.** In-process scheduler triggers on the 1st; creates Fee rows for every active enrollment.
11. **Deploy.** Caddyfile, Dockerfiles, document deploy in `docs/OPS.md`.

Student portal is deferred — stub the routes (returning 501 Not Implemented) so the auth and routing hooks are in place. Build the UI in v1.1.

---

## Conventions Claude Code should follow

- Every DB query goes through the tenancy scope. Never `db.Where("school_id = ?", id)` manually — use the scope. Lint rule or PR review catches violations.
- Money is `decimal.Decimal`, serialized as a string. The React side uses a typed wrapper that never converts to a number.
- Errors returned from handlers are typed (`apperr.NotFound`, `apperr.Unauthorized`, etc.) and mapped to HTTP statuses by a single error middleware.
- Tests live in `api/tests/` and run against a real Postgres in CI (use `pg_dump`/restore for fixtures).
- Frontend uses TanStack Query (or similar) for server state. No global Redux store. Local UI state in components.
- Tailwind only; no custom CSS files unless absolutely needed.
- Component library: build from scratch on top of headless primitives (Radix UI). Avoid heavy UI kits like MUI — they fight Tailwind.

---

## What's deliberately not specified

These are decisions Claude Code should make in-context, not pre-decide here:

- Specific Go libraries beyond the core stack (Fiber, GORM, decimal, jwt). Claude Code picks (e.g.) the validation library it prefers.
- React routing library (react-router most likely).
- Test runner choices.
- Specific Tailwind component patterns.

DECISIONS.md captures the load-bearing choices. Everything else is craftsmanship.
