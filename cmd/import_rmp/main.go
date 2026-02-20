package main

import (
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	_ "github.com/mattn/go-sqlite3"
)

type RMPEntry struct {
	ID                string   `json:"id"`
	FirstName         string   `json:"first_name"`
	LastName          string   `json:"last_name"`
	AvgRating         float64  `json:"avg_rating"`
	NumRatings        int      `json:"num_ratings"`
	Department        string   `json:"department"`
	AvgDifficulty     float64  `json:"avg_difficulty"`
	WouldTakeAgainPct *float64 `json:"would_take_again_percent"`
}

func main() {
	dbPath := flag.String("db", "database/courses.db", "path to sqlite db")
	jsonPath := flag.String("file", "rmp.json", "path to rmp.json")
	flag.Parse()

	//Loads JSON file into memory.
	f, err := os.Open(*jsonPath)
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()

	var entries []RMPEntry
	if err := json.NewDecoder(f).Decode(&entries); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("Loaded %d entries\n", len(entries))

	//Opens SQLite database.
	db, err := sql.Open("sqlite3", *dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if _, err := db.Exec(`PRAGMA foreign_keys = ON;`); err != nil {
		log.Fatal(err)
	}

	// Confirm the instructors table exists.
	var tableName string
	err = db.QueryRow(`
		SELECT name
		FROM sqlite_master
		WHERE type='table' AND name='instructors';
	`).Scan(&tableName)
	if err != nil {
		log.Fatal("instructors table not found. Did you run migrations 001 + 002?")
	}
	fmt.Println("Found table:", tableName)

	if len(entries) == 0 {
		fmt.Println("No entries to import.")
		return
	}

	// Inserts one instructor, as a test.

	e := entries[0]
	fullName := strings.TrimSpace(e.FirstName + " " + e.LastName)

	//need to redo this
	nameNormalized := strings.ToLower(fullName)

	_, err = db.Exec(`
		INSERT INTO instructors (
			name,
			name_normalized,
			department,
			external_source,
			external_id,
			ext_avg_rating,
			ext_avg_difficulty,
			ext_num_ratings,
			ext_last_scraped
		) VALUES (?, ?, ?, 'RMP', ?, ?, ?, ?, datetime('now'));
	`,
		fullName,
		nameNormalized,
		e.Department,
		e.ID,
		e.AvgRating,
		e.AvgDifficulty,
		e.NumRatings,
	)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Inserted 1 instructor row.")
}

//Still need to
//Insert all entries, not jus first one.
//Normalize names same across everything (lowercase, remove extra spaces/punctuation).
// Store would_take_again_percent into ext_would_take_again
//learn upsert and use it
