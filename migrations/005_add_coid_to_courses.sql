PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- Add `coid` column to link scraped course IDs to the catalog
ALTER TABLE courses ADD COLUMN coid INTEGER;

CREATE INDEX IF NOT EXISTS idx_courses_coid ON courses(coid);

COMMIT;
