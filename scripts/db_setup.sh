#!/usr/bin/env bash
set -e

DB_PATH="database/courses.db"

echo "Rebuilding database…"
rm -f $DB_PATH
sqlite3 $DB_PATH < migrations/001_seed_data.sql
sqlite3 $DB_PATH < migrations/002_schema_extend.sql
sqlite3 $DB_PATH < migrations/004_degree_planner.sql
sqlite3 $DB_PATH < migrations/005_add_coid_to_courses.sql
sqlite3 $DB_PATH < migrations/006_requisites_seed.sql
sqlite3 $DB_PATH < migrations/007_backfill_coids.sql
sqlite3 $DB_PATH  < migrations/008_users_program_year.sql
sqlite3 $DB_PATH < migrations/009_programs_seed.sql
sqlite3 $DB_PATH < migrations/010_requirement_groups_seed.sql
sqlite3 $DB_PATH < migrations/011_requirement_courses_seed.sql
sqlite3 $DB_PATH < migrations/012_missing_courses.sql
echo "Database ready."
