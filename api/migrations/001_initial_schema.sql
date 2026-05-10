-- Foundation (no dependencies):
-- 1. schools
-- 2. academic_years  (depends on schools)
-- People (depend on schools):
-- 3. teachers
-- 4. students
-- 5. users           (depends on teachers, students)
-- Class structure:
-- 6. classes         (depends on schools)
-- 7. class_years     (depends on classes, academic_years, teachers)
-- 8. enrollments     (depends on students, class_years)
-- Fees:
-- 9. fees            (depends on enrollments)
-- 10. payments       (depends on fees)
-- 11. receipt_counters (depends on schools)
-- Academics:
-- 12. notices        (depends on users)
-- 13. notice_targets (depends on notices, class_years)
-- 14. homeworks      (depends on teachers)
-- 15. homework_targets (depends on homeworks, class_years)
-- 16. exams          (depends on class_years, teachers)
-- 17. results        (depends on exams, enrollments)
-- 18. assessments    (depends on exams, teachers)
-- 19. assessment_marks (depends on assessments, enrollments)
-- Library & Audit:
-- 20. library_files  (depends on users, academic_years)
-- 21. audit_logs     (depends on users)
/ / Schools
CREATE TABLE
    schools (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        code VARCHAR(20) UNIQUE NOT NULL,
        address TEXT,
        phone VARCHAR(20),
        email VARCHAR(200),
        logo_url VARCHAR(500),
        receipt_format VARCHAR(100),
        receipt_reset VARCHAR(20) DEFAULT 'yearly',
        receipt_starting_num INTEGER DEFAULT 1,
        sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
    );

/ / Academic Years
CREATE TABLE
    academic_years (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE CASCADE,
        year_label VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_current BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (school_id, year_label)
    );

-- Only one current year per school
CREATE UNIQUE INDEX idx_one_current_year_per_school ON academic_years (school_id)
WHERE
    is_current = TRUE;

-- Speed index for school lookups
CREATE INDEX idx_academic_years_school ON academic_years (school_id);

/ / Teachers
CREATE TABLE
    teachers (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        employee_id VARCHAR(50) NOT NULL,
        name VARCHAR(200) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(200),
        subject VARCHAR(100),
        qualification VARCHAR(200),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (school_id, employee_id)
    );

CREATE INDEX idx_teachers_school ON teachers (school_id, is_active);

/ / Students
CREATE TABLE
    students (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        admission_number VARCHAR(50) NOT NULL,
        epunjab_id VARCHAR(50),
        name VARCHAR(200) NOT NULL,
        gender VARCHAR(10),
        date_of_birth DATE,
        phone VARCHAR(20),
        aadhar_number VARCHAR(20),
        father_name VARCHAR(200),
        father_contact VARCHAR(20),
        mother_name VARCHAR(200),
        mother_contact VARCHAR(20),
        caste VARCHAR(50),
        email VARCHAR(200),
        address TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (school_id, admission_number)
    );

CREATE INDEX idx_students_school_active ON students (school_id, is_active);

/ / Users
CREATE TABLE
    users (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        username VARCHAR(100) NOT NULL,
        password_hash VARCHAR(500) NOT NULL,
        role VARCHAR(20) NOT NULL,
        teacher_id BIGINT REFERENCES teachers (id) ON DELETE SET NULL,
        student_id BIGINT REFERENCES students (id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (school_id, username),
        CHECK (
            NOT (
                teacher_id IS NOT NULL
                AND student_id IS NOT NULL
            )
        )
    );

/ / classes
CREATE TABLE
    classes (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        number INTEGER NOT NULL,
        section VARCHAR(10) NOT NULL,
        board VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        deleted_at TIMESTAMPTZ,
        UNIQUE (school_id, number, section)
    );

CREATE INDEX idx_classes_deleted_at ON classes (deleted_at);

/ / class_years
CREATE TABLE
    class_years (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        class_id BIGINT NOT NULL REFERENCES classes (id) ON DELETE RESTRICT,
        academic_year_id BIGINT NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
        class_teacher_id BIGINT REFERENCES teachers (id) ON DELETE SET NULL,
        tuition_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
        transport_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        deleted_at TIMESTAMPTZ,
        UNIQUE (class_id, academic_year_id)
    );

CREATE INDEX idx_class_years_deleted_at ON class_years (deleted_at);

/ / enrollments
CREATE TABLE
    