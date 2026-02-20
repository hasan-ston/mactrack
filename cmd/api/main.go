package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"mactrack/pkg"
)

func main() {
	dbPath := "database/courses.db"
	if env := os.Getenv("MACTRACK_DB"); env != "" {
		dbPath = env
	}

	repo, err := pkg.NewRepository(dbPath)
	if err != nil {
		log.Fatalf("failed to open repository: %v", err)
	}
	defer repo.Close()

	// Routes
	http.HandleFunc("/api/courses", pkg.CoursesHandler(repo))
	http.HandleFunc("/api/courses/", pkg.CourseHandler(repo))

	addr := ":8080"
	if a := os.Getenv("PORT"); a != "" {
		addr = ":" + a
	}

	srv := &http.Server{
		Addr:         addr,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("starting server on %s (db=%s)", addr, dbPath)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
