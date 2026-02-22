-- Migration: Add degree planner tables
-- Run with: sqlite3 database/courses.db < database/migrations/migration_degree_planner.sql

-- One row per scraped program from preview_program.php?catoid=58&poid=XXXX
CREATE TABLE IF NOT EXISTS programs (
    program_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    poid         INTEGER UNIQUE NOT NULL, -- McMaster's internal program ID from the URL param &poid=
    name         TEXT    NOT NULL,        -- e.g. "Honours Computer Science as a Second Degree (B.A.Sc.)"
    degree_type  TEXT,                   -- e.g. "Bachelor of Applied Science" (from the index page grouping)
    total_units  INTEGER,                -- parsed from "N units total" at top of page; NULL if not present
    catalog_year TEXT    NOT NULL        -- e.g. "2025-2026"
);

-- A named section in a program's requirement tree.
-- Can be a container (e.g. "Level III: 30 Units") with child groups but no direct courses,
-- or a leaf (e.g. "27 units") that holds requirement_courses rows.
-- Nesting is modelled via parent_group_id; NULL means top-level within the program.
CREATE TABLE IF NOT EXISTS requirement_groups (
    group_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    program_id       INTEGER NOT NULL REFERENCES programs(program_id),
    parent_group_id  INTEGER REFERENCES requirement_groups(group_id), -- NULL = root group
    display_order    INTEGER NOT NULL,    -- position among siblings (same parent_group_id)
    heading          TEXT    NOT NULL,    -- raw heading text, e.g. "3 units from"
    heading_level    INTEGER NOT NULL,    -- HTML heading depth: 2=h2, 3=h3, 4=h4, 5=h5
    units_required   INTEGER,            -- numeric units parsed from heading, e.g. 27 from "27 units"
    courses_required INTEGER,            -- course count parsed if heading says "N courses"
    is_elective      INTEGER DEFAULT 0,  -- 1 when the only list item is a free "Electives" label
    is_container     INTEGER DEFAULT 0   -- 1 for sections that only hold child groups (no direct courses)
);

-- One course-level row within a leaf requirement_groups entry.
-- Three distinct row types:
--   1. Specific required course:   coid IS NOT NULL, adhoc_text IS NULL
--   2. OR-preceding course:        coid IS NOT NULL, is_or_with_next = 1
--   3. Free-text alternative:      coid IS NULL,     adhoc_text IS NOT NULL
--      (class="acalog-adhoc-after" in the HTML — describes an unenumerable option, e.g. "List G electives")
CREATE TABLE IF NOT EXISTS requirement_courses (
    req_course_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id        INTEGER NOT NULL REFERENCES requirement_groups(group_id),
    display_order   INTEGER NOT NULL,
    coid            INTEGER,             -- McMaster coid from showCourse(); NULL for adhoc rows
    course_code     TEXT,               -- e.g. "COMPSCI 2C03"  (denormalised for readability)
    course_name     TEXT,               -- e.g. "Data Structures and Algorithms"
    is_or_with_next INTEGER DEFAULT 0,  -- 1 when class="acalog-adhoc-before": this course is "X or <next>"
    adhoc_text      TEXT                -- free-text for acalog-adhoc-after rows; NULL for real courses
);

-- Indexes for the most common access patterns
CREATE INDEX IF NOT EXISTS idx_req_groups_program   ON requirement_groups (program_id);
CREATE INDEX IF NOT EXISTS idx_req_groups_parent    ON requirement_groups (parent_group_id);
CREATE INDEX IF NOT EXISTS idx_req_courses_group    ON requirement_courses (group_id);
CREATE INDEX IF NOT EXISTS idx_req_courses_coid     ON requirement_courses (coid);