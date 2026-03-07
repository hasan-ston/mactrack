package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"mactrack/pkg"

	"github.com/joho/godotenv"
)

func init() {
	// Load .env if present (ignored in production where vars come from the environment).
	if err := godotenv.Load(); err != nil {
		log.Println("no .env file found, using environment variables")
	}
}

func main() {
	// DATABASE_URL accepts a full PostgreSQL DSN (postgres://...) for production
	// or a SQLite file path for local development without Postgres.
	// Prefer DATABASE_URL; fall back to legacy MACTRACK_DB, then default SQLite file.
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("MACTRACK_DB")
	}
	if dsn == "" {
		dsn = "database/courses.db"
	}

	repo, err := pkg.NewRepository(dsn)
	if err != nil {
		log.Fatalf("failed to open repository: %v", err)
	}
	defer repo.Close()

	svc := &pkg.Service{Repo: repo}

	mux := pkg.NewMux(repo, svc)

	addr := ":8080"
	if a := os.Getenv("PORT"); a != "" {
		addr = ":" + a
	}

	srv := &http.Server{
		Addr:         addr,
		Handler:      pkg.CORS(mux),
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("starting server on %s (db=%s)", addr, dsn)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
