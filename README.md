
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
	- sqlite3 mactrack.db < migrations/001_init.sql

## Frontend (React + Vite)
1. Install Node.js (18+ recommended).
2. cd web
3. Run `npm install` to install dependencies.
4. Run `npm run dev` to start the frontend

## Environment Variables
1. Copy `.env.example` to `.env` and fill in your values.

## Deployment
Build frontend: `npm run build` (output in web/dist)

## Contributing
1. Create a feature branch for your work.
2. Open a pull request for review.
