-- schema_test.sql  –  DDL-only fixture used by Go unit tests.
-- Contains NO INSERT/seed data so newTestRepo() runs in milliseconds.
-- Keep in sync with the numbered migrations whenever a new table or
-- column is added (migrations 000, 002, 004, 005, 008).

PRAGMA foreign_keys=ON;

-- ── core course catalogue ────────────────────────────────────────────────────
CREATE TABLE courses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    subject       TEXT NOT NULL,
    course_number TEXT NOT NULL,
    course_name   TEXT,
    professor     TEXT,
    term          TEXT NOT NULL,
    coid          INTEGER,
    UNIQUE(subject, course_number, term)
);

CREATE TABLE instructors (
    instructor_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    name_normalized   TEXT NOT NULL UNIQUE,
    department        TEXT,
    email             TEXT,
    external_source   TEXT,
    external_id       TEXT,
    external_url      TEXT,
    ext_avg_rating     REAL,
    ext_avg_difficulty REAL,
    ext_num_ratings    INTEGER,
    ext_last_scraped   TEXT,
    UNIQUE(external_source, external_id)
);

CREATE TABLE course_instructors (
    course_row_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    instructor_id INTEGER NOT NULL REFERENCES instructors(instructor_id) ON DELETE CASCADE,
    PRIMARY KEY(course_row_id, instructor_id)
);

CREATE TABLE course_outlines (
    outline_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    course_row_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    url           TEXT NOT NULL,
    fetched_at    TEXT,
    checksum      TEXT,
    UNIQUE(course_row_id, url)
);

CREATE TABLE requisites (
    req_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    subject           TEXT NOT NULL,
    course_number     TEXT NOT NULL,
    req_subject       TEXT NOT NULL,
    req_course_number TEXT NOT NULL,
    kind              TEXT NOT NULL CHECK (kind IN ('PREREQ','COREQ','ANTIREQ')),
    note              TEXT,
    CHECK(subject <> req_subject OR course_number <> req_course_number)
);

-- ── users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
    user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT NOT NULL UNIQUE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    program       TEXT,
    year_of_study INTEGER
);

-- ── reviews & stats ──────────────────────────────────────────────────────────
CREATE TABLE course_reviews (
    review_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    subject       TEXT NOT NULL,
    course_number TEXT NOT NULL,
    rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    difficulty    INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
    workload      INTEGER CHECK (workload BETWEEN 1 AND 5),
    text          TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, subject, course_number)
);

CREATE TABLE instructor_reviews (
    review_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    instructor_id INTEGER NOT NULL REFERENCES instructors(instructor_id) ON DELETE CASCADE,
    rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text          TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, instructor_id)
);

CREATE TABLE course_stats (
    stat_id       INTEGER PRIMARY KEY AUTOINCREMENT,
    subject       TEXT NOT NULL,
    course_number TEXT NOT NULL,
    term          TEXT,
    avg_type      TEXT NOT NULL CHECK (avg_type IN ('MEAN','MEDIAN')),
    value         REAL NOT NULL CHECK (value BETWEEN 0 AND 100),
    source        TEXT NOT NULL DEFAULT 'USER',
    submitted_by  INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── degree planner (migration 004) ───────────────────────────────────────────
CREATE TABLE plan_terms (
    plan_term_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    year_index   INTEGER NOT NULL CHECK (year_index BETWEEN 1 AND 8),
    season       TEXT NOT NULL CHECK (season IN ('Fall','Winter','Spring','Summer')),
    UNIQUE(user_id, year_index, season)
);

CREATE TABLE plan_items (
    plan_item_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_term_id  INTEGER NOT NULL REFERENCES plan_terms(plan_term_id) ON DELETE CASCADE,
    subject       TEXT NOT NULL,
    course_number TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','DROPPED')),
    grade         TEXT,
    note          TEXT,
    UNIQUE(plan_term_id, subject, course_number)
);

-- ── programs & requirements ───────────────────────────────────────────────────
CREATE TABLE programs (
    program_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    poid         INTEGER UNIQUE NOT NULL,
    name         TEXT NOT NULL,
    degree_type  TEXT,
    total_units  INTEGER,
    catalog_year TEXT NOT NULL
);

CREATE TABLE requirement_groups (
    group_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id       INTEGER NOT NULL REFERENCES programs(program_id),
    parent_group_id  INTEGER REFERENCES requirement_groups(group_id),
    display_order    INTEGER NOT NULL,
    heading          TEXT NOT NULL,
    heading_level    INTEGER NOT NULL,
    units_required   INTEGER,
    courses_required INTEGER,
    is_elective      INTEGER DEFAULT 0,
    is_container     INTEGER DEFAULT 0
);

CREATE TABLE requirement_courses (
    req_course_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id        INTEGER NOT NULL REFERENCES requirement_groups(group_id),
    display_order   INTEGER NOT NULL,
    coid            INTEGER,
    course_code     TEXT,
    course_name     TEXT,
    is_or_with_next INTEGER DEFAULT 0,
    adhoc_text      TEXT
);

-- ── view ─────────────────────────────────────────────────────────────────────
CREATE VIEW v_course_rating AS
SELECT
    subject,
    course_number,
    COUNT(*) AS n_reviews,
    ROUND(AVG(rating),     2) AS avg_rating,
    ROUND(AVG(difficulty), 2) AS avg_difficulty,
    ROUND(AVG(workload),   2) AS avg_workload
FROM course_reviews
GROUP BY subject, course_number;

-- ── indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_courses_subject_term        ON courses(subject, term);
CREATE INDEX idx_courses_coid                ON courses(coid);
CREATE INDEX idx_instructors_name            ON instructors(name);
CREATE INDEX idx_course_instructors_instructor ON course_instructors(instructor_id);
CREATE INDEX idx_outlines_course_row         ON course_outlines(course_row_id);
CREATE INDEX idx_req_course                  ON requisites(subject, course_number, kind);
CREATE INDEX idx_course_reviews_course       ON course_reviews(subject, course_number);
CREATE INDEX idx_instructor_reviews_prof     ON instructor_reviews(instructor_id);
CREATE INDEX idx_course_stats_course_term    ON course_stats(subject, course_number, term);
CREATE INDEX idx_plan_items_course           ON plan_items(subject, course_number);
CREATE INDEX idx_req_groups_program          ON requirement_groups(program_id);
CREATE INDEX idx_req_groups_parent           ON requirement_groups(parent_group_id);
CREATE INDEX idx_req_courses_group           ON requirement_courses(group_id);
CREATE INDEX idx_req_courses_coid            ON requirement_courses(coid);
