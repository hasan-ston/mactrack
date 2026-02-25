-- Add program and year_of_study to users table
ALTER TABLE users ADD COLUMN program TEXT;
ALTER TABLE users ADD COLUMN year_of_study INTEGER;
