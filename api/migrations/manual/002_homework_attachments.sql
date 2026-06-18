-- Manual delta: homework_attachments
--
-- Apply by hand to any EXISTING database (live Postgres + the local dev DB on
-- 5432). It is NOT picked up by the migration runner (which globs
-- migrations/*.sql, non-recursive) — fresh installs get this table from the
-- copy folded into 001_initial_schema.sql instead. IF NOT EXISTS makes it safe
-- to re-run.

CREATE TABLE IF NOT EXISTS
    homework_attachments (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        homework_id BIGINT NOT NULL REFERENCES homeworks (id) ON DELETE CASCADE,
        file_url TEXT NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        content_type VARCHAR(100) NOT NULL,
        file_size BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
    );

CREATE INDEX IF NOT EXISTS idx_homework_attachments_homework ON homework_attachments (homework_id);

CREATE INDEX IF NOT EXISTS idx_homework_attachments_school ON homework_attachments (school_id);
