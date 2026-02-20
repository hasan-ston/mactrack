PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- adds RMP would_take_again_percent to instructors
ALTER TABLE instructors ADD COLUMN ext_would_take_again REAL;

COMMIT;