
# MacTrack Setup Instructions

## Backend (Go)
1. Install Go 1.21 or newer.
2. Run `go mod tidy` in the project root.
3. To start the backend server:
	- cd cmd/api
	- go run main.go

## Database
1. Use the migrations in the `migrations/` folder to set up your database schema.
2. Example (SQLite):
	- sqlite3 database/courses.db < migrations/001_seed_data.sql
	- sqlite3 database/courses.db < migrations/002_schema_extend.sql
	- sqlite3 database/courses.db < migrations/003_test_queries.sql
	- sqlite3 database/courses.db < migrations/004_degree_planner.sql
	- sqlite3 database/courses.db < migrations/005_add_coid_to_courses.sql
	- sqlite3 database/courses.db < migrations/006_requisites_seed.sql
	- sqlite3 database/courses.db < migrations/007_backfill_coids.sql
	- sqlite3 database/courses.db < migrations/008_users_program_year.sql
	- sqlite3 database/courses.db < migrations/009_programs_seed.sql
	- sqlite3 database/courses.db < migrations/010_requirement_groups_seed.sql
	- sqlite3 database/courses.db < migrations/011_requirement_courses_seed.sql
	- sqlite3 database/courses.db < migrations/012_missing_courses.sql



	

## Frontend (React + Vite)
1. Install Node.js (18+ recommended).
2. cd web
3. Run `npm install` to install dependencies.
4. Run `npm run dev` to start the frontend

## Deployment
Build frontend: `npm run build` (output in web/dist)

from project root: go run ./cmd/api/main.go