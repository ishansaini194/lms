-- Schools
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

-- Academic Years
CREATE TABLE
    academic_years (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
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

-- Teachers
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

CREATE INDEX idx_teachers_school_active ON teachers (school_id, is_active);

-- Students
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

-- Users
CREATE TABLE
    users (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        username VARCHAR(100) NOT NULL,
        password_hash VARCHAR(500) NOT NULL,
        role VARCHAR(20) NOT NULL,
        display_name VARCHAR(200),
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

-- push_subscriptions
-- Web Push subscriptions, one row per device/browser endpoint. Endpoint is
-- unique so re-subscribing the same device upserts (never duplicates). Owned by
-- a user; CASCADE so deactivating/deleting a user drops their subscriptions.
-- Used to send notifications in a later stage.
CREATE TABLE
    push_subscriptions (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (endpoint)
    );

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions (user_id);

CREATE INDEX idx_push_subscriptions_school ON push_subscriptions (school_id);

-- classes
CREATE TABLE
    classes (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        name VARCHAR(20) NOT NULL,
        section VARCHAR(10) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        board VARCHAR(20),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE (school_id, name, section)
    );

CREATE INDEX idx_classes_school_active ON classes (school_id, is_active);

CREATE INDEX idx_classes_school_sort ON classes (school_id, sort_order);

-- class_years
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
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        UNIQUE (class_id, academic_year_id)
    );

-- CREATE INDEX idx_class_years_deleted_at ON class_years (deleted_at);
CREATE INDEX idx_class_years_school_active ON class_years (school_id, is_active);

-- teaching_assignments
-- Records which subjects a teacher teaches to a class_year (the subject-teacher
-- relationship). Distinct from class_years.class_teacher_id, which is the single
-- "class teacher" (owner) of a section. A teacher may teach several subjects to
-- several class_years and need not be the class teacher of any of them.
CREATE TABLE
    teaching_assignments (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        teacher_id BIGINT NOT NULL REFERENCES teachers (id) ON DELETE CASCADE,
        class_year_id BIGINT NOT NULL REFERENCES class_years (id) ON DELETE CASCADE,
        subject VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (teacher_id, class_year_id, subject)
    );

CREATE INDEX idx_teaching_assignments_school ON teaching_assignments (school_id);

CREATE INDEX idx_teaching_assignments_teacher ON teaching_assignments (teacher_id, is_active);

CREATE INDEX idx_teaching_assignments_class_year ON teaching_assignments (class_year_id);

-- enrollments
CREATE TABLE
    enrollments (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        student_id BIGINT NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
        class_year_id BIGINT NOT NULL REFERENCES class_years (id) ON DELETE RESTRICT,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        left_on DATE,
        left_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (student_id, class_year_id),
        CHECK (
            status IN ('active', 'left', 'graduated', 'promoted')
        )
    );

CREATE INDEX idx_enrollments_school ON enrollments (school_id);

CREATE INDEX idx_enrollments_status ON enrollments (class_year_id, status);

-- fee
CREATE TABLE
    fees (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        enrollment_id BIGINT NOT NULL REFERENCES enrollments (id) ON DELETE RESTRICT,
        fee_type VARCHAR(20) NOT NULL,
        month INTEGER NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        due_date DATE NOT NULL,
        discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
        discount_reason VARCHAR(200),
        status VARCHAR(20) NOT NULL DEFAULT 'unpaid',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (enrollment_id, fee_type, month),
        CHECK (month BETWEEN 1 AND 12),
        CHECK (
            discount >= 0
            AND discount <= amount
        )
    );

CREATE INDEX idx_fees_school ON fees (school_id);

CREATE INDEX idx_fees_enrollment_status ON fees (enrollment_id, status);

-- payments
CREATE TABLE
    payments (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        fee_id BIGINT NOT NULL REFERENCES fees (id) ON DELETE RESTRICT,
        receipt_no VARCHAR(50) NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        payment_mode VARCHAR(20) NOT NULL,
        paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        status VARCHAR(20) NOT NULL DEFAULT 'completed',
        reversed_at TIMESTAMPTZ,
        reversal_reason TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (school_id, receipt_no),
        CHECK (amount > 0)
    );

CREATE INDEX idx_payments_school_paid_at ON payments (school_id, paid_at DESC);

CREATE INDEX idx_payments_fee ON payments (fee_id);

-- receipt_counters
CREATE TABLE
    receipt_counters (
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        period_key VARCHAR(50) NOT NULL,
        last_number INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        PRIMARY KEY (school_id, period_key)
    );

-- notices
CREATE TABLE
    notices (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        posted_by_id BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        title VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        target_all_school BOOLEAN NOT NULL DEFAULT FALSE,
        attachment_url TEXT, -- optional single attachment (PDF or image)
        attachment_size BIGINT,
        attachment_name VARCHAR(255), -- original filename for the download header
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        is_active BOOLEAN NOT NULL DEFAULT TRUE
    );

CREATE INDEX idx_notices_school_created ON notices (school_id, created_at DESC);

-- notice_targets
CREATE TABLE
    notice_targets (
        notice_id BIGINT NOT NULL REFERENCES notices (id) ON DELETE CASCADE,
        class_year_id BIGINT NOT NULL REFERENCES class_years (id) ON DELETE CASCADE,
        PRIMARY KEY (notice_id, class_year_id)
    );

CREATE INDEX idx_notice_targets_class ON notice_targets (class_year_id);

-- subjects (per-school master list; referenced by homeworks + library)
CREATE TABLE
    subjects (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (school_id, name)
    );

CREATE INDEX idx_subjects_school ON subjects (school_id);

-- homeworks
CREATE TABLE
    homeworks (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        teacher_id BIGINT NOT NULL REFERENCES teachers (id) ON DELETE RESTRICT,
        subject_id BIGINT REFERENCES subjects (id),
        content TEXT NOT NULL,
        due_date DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        is_active BOOLEAN NOT NULL DEFAULT TRUE
    );

CREATE INDEX idx_homeworks_school_due ON homeworks (school_id, due_date);

-- homework_targets
CREATE TABLE
    homework_targets (
        homework_id BIGINT NOT NULL REFERENCES homeworks (id) ON DELETE CASCADE,
        class_year_id BIGINT NOT NULL REFERENCES class_years (id) ON DELETE CASCADE,
        PRIMARY KEY (homework_id, class_year_id)
    );

CREATE INDEX idx_homework_targets_class ON homework_targets (class_year_id);

-- homework_attachments (images/PDFs attached to a homework; multiple per homework)
CREATE TABLE
    homework_attachments (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        homework_id BIGINT NOT NULL REFERENCES homeworks (id) ON DELETE CASCADE,
        file_url TEXT NOT NULL,
        file_name VARCHAR(255) NOT NULL, -- original filename, for display + download
        content_type VARCHAR(100) NOT NULL, -- image/jpeg | image/png | application/pdf
        file_size BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
    );

CREATE INDEX idx_homework_attachments_homework ON homework_attachments (homework_id);

CREATE INDEX idx_homework_attachments_school ON homework_attachments (school_id);

-- exam_terms
-- A school-wide exam term (e.g. Mid-Term, Final, Unit Test 1) tied to an academic
-- year. Groups the per-class subject-exams that sit under it; those exams stay
-- per class_year with their own subject/max_marks/teacher/date. Declared before
-- `exams` so the exams.exam_term_id foreign key below resolves.
CREATE TABLE
    exam_terms (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        academic_year_id BIGINT NOT NULL REFERENCES academic_years (id) ON DELETE RESTRICT,
        name VARCHAR(100) NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (school_id, academic_year_id, name)
    );

CREATE INDEX idx_exam_terms_school ON exam_terms (school_id);

CREATE INDEX idx_exam_terms_year ON exam_terms (school_id, academic_year_id);

-- exams
CREATE TABLE
    exams (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        class_year_id BIGINT NOT NULL REFERENCES class_years (id) ON DELETE RESTRICT,
        teacher_id BIGINT REFERENCES teachers (id) ON DELETE SET NULL,
        exam_term_id BIGINT REFERENCES exam_terms (id) ON DELETE RESTRICT,
        name VARCHAR(100) NOT NULL,
        subject VARCHAR(100) NOT NULL,
        max_marks INTEGER NOT NULL,
        exam_date DATE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        CHECK (max_marks > 0)
    );

CREATE INDEX idx_exams_school ON exams (school_id);

CREATE INDEX idx_exams_school_active ON exams (school_id, is_active);

CREATE INDEX idx_exams_class_year ON exams (class_year_id);

CREATE INDEX idx_exams_exam_term ON exams (exam_term_id);

-- results
CREATE TABLE
    results (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        exam_id BIGINT NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
        enrollment_id BIGINT NOT NULL REFERENCES enrollments (id) ON DELETE RESTRICT,
        marks NUMERIC(6, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (exam_id, enrollment_id),
        CHECK (marks >= 0)
    );

CREATE INDEX idx_results_school ON results (school_id);

CREATE INDEX idx_results_enrollment ON results (enrollment_id);

-- assessments
CREATE TABLE
    assessments (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        exam_id BIGINT NOT NULL REFERENCES exams (id) ON DELETE CASCADE,
        teacher_id BIGINT NOT NULL REFERENCES teachers (id) ON DELETE RESTRICT,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        max_marks INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        CHECK (max_marks > 0)
    );

CREATE INDEX idx_assessments_school ON assessments (school_id);

CREATE INDEX idx_assessments_exam ON assessments (exam_id);

CREATE INDEX idx_assessments_teacher ON assessments (teacher_id);

CREATE INDEX idx_assessments_school_active ON assessments (school_id, is_active);

-- assessment_marks
CREATE TABLE
    assessment_marks (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        assessment_id BIGINT NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
        enrollment_id BIGINT NOT NULL REFERENCES enrollments (id) ON DELETE RESTRICT,
        marks NUMERIC(6, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        UNIQUE (assessment_id, enrollment_id),
        CHECK (marks >= 0)
    );

CREATE INDEX idx_assessment_marks_school ON assessment_marks (school_id);

CREATE INDEX idx_assessment_marks_enrollment ON assessment_marks (enrollment_id);

-- library (notes/pyq PDFs, targeted to one or more class_years via library_targets)
CREATE TABLE
    library (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        uploaded_by_id BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        category VARCHAR(20) NOT NULL, -- 'notes' | 'pyq'
        subject_id BIGINT REFERENCES subjects (id),
        title VARCHAR(200) NOT NULL,
        file_url TEXT NOT NULL,
        file_size BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
    );

CREATE INDEX idx_library_school ON library (school_id);

CREATE INDEX idx_library_school_category ON library (school_id, category);

CREATE TABLE
    library_targets (
        library_id BIGINT NOT NULL REFERENCES library (id) ON DELETE CASCADE,
        class_year_id BIGINT NOT NULL REFERENCES class_years (id),
        PRIMARY KEY (library_id, class_year_id)
    );

CREATE INDEX idx_library_targets_class ON library_targets (class_year_id);

-- audit_logs
CREATE TABLE
    audit_logs (
        id BIGSERIAL PRIMARY KEY,
        school_id BIGINT NOT NULL REFERENCES schools (id) ON DELETE RESTRICT,
        user_id BIGINT REFERENCES users (id) ON DELETE SET NULL,
        action VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id BIGINT NOT NULL,
        before JSONB,
        after JSONB,
        reason TEXT,
        ip_address VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
    );

CREATE INDEX idx_audit_school_entity ON audit_logs (school_id, entity_type, entity_id);

CREATE INDEX idx_audit_school_created ON audit_logs (school_id, created_at DESC);

CREATE INDEX idx_audit_user ON audit_logs (user_id);