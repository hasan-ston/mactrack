package main

import (
	"database/sql"
	"encoding/json"
	"flag"
	"log"
	"os"
	"strings"
	"unicode"

	_ "github.com/mattn/go-sqlite3"
)

/*
To run:
  go run cmd/import_rmp/main.go --file rmp.json --db database/courses.db

  Loads RateMyProf data from rmp.json
  Stores:
    name, name_normalized, department,
    ext_avg_rating, ext_avg_difficulty, ext_num_ratings, ext_would_take_again
*/

type RMPEntry struct {
	ID                string   `json:"id"`
	FirstName         string   `json:"first_name"`
	LastName          string   `json:"last_name"`
	AvgRating         float64  `json:"avg_rating"`
	NumRatings        int      `json:"num_ratings"`
	Department        string   `json:"department"`
	WouldTakeAgainPct *float64 `json:"would_take_again_percent"`
	AvgDifficulty     float64  `json:"avg_difficulty"`
}

func normalizeName(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))

	var b strings.Builder
	space := false

	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			space = false
			continue
		}
		if unicode.IsSpace(r) {
			if !space {
				b.WriteRune(' ')
				space = true
			}
			continue
		}
		// punctuation ignored
	}

	return strings.TrimSpace(b.String())
}

func tableExists(db *sql.DB, table string) (bool, error) {
	var name string
	err := db.QueryRow(`
		SELECT name
		FROM sqlite_master
		WHERE type='table' AND name = ?;
	`, table).Scan(&name)

	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func main() {
	dbPath := flag.String("db", "database/courses.db", "path to sqlite db")
	jsonPath := flag.String("file", "rmp.json", "path to rmp.json")
	flag.Parse()

	f, err := os.Open(*jsonPath)
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()

	var entries []RMPEntry
	if err := json.NewDecoder(f).Decode(&entries); err != nil {
		log.Fatal(err)
	}

	db, err := sql.Open("sqlite3", *dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	ok, err := tableExists(db, "instructors")
	if err != nil {
		log.Fatal(err)
	}
	if !ok {
		log.Fatal("missing 'instructors' table, run migrations before importing.")
	}

	tx, err := db.Begin()
	if err != nil {
		log.Fatal(err)
	}
	defer func() { _ = tx.Rollback() }()

	upsertByExternal, err := tx.Prepare(`
		INSERT INTO instructors (
			name,
			name_normalized,
			department,
			external_source,
			external_id,
			ext_avg_rating,
			ext_avg_difficulty,
			ext_num_ratings,
			ext_would_take_again,
			ext_last_scraped
		) VALUES (?, ?, ?, 'RMP', ?, ?, ?, ?, ?, datetime('now'))
		ON CONFLICT(external_source, external_id) DO UPDATE SET
			name = excluded.name,
			name_normalized = excluded.name_normalized,
			department = excluded.department,
			ext_avg_rating = excluded.ext_avg_rating,
			ext_avg_difficulty = excluded.ext_avg_difficulty,
			ext_num_ratings = excluded.ext_num_ratings,
			ext_would_take_again = excluded.ext_would_take_again,
			ext_last_scraped = excluded.ext_last_scraped;
	`)
	if err != nil {
		log.Fatal(err)
	}
	defer upsertByExternal.Close()

	updateByNormalized, err := tx.Prepare(`
		UPDATE instructors
		SET
			name = ?,
			department = ?,
			external_source = 'RMP',
			external_id = ?,
			ext_avg_rating = ?,
			ext_avg_difficulty = ?,
			ext_num_ratings = ?,
			ext_would_take_again = ?,
			ext_last_scraped = datetime('now')
		WHERE name_normalized = ?;
	`)
	if err != nil {
		log.Fatal(err)
	}
	defer updateByNormalized.Close()

	for _, e := range entries {
		full := strings.TrimSpace(strings.TrimSpace(e.FirstName) + " " + strings.TrimSpace(e.LastName))
		if e.ID == "" || full == "" {
			continue
		}

		norm := normalizeName(full)
		if norm == "" {
			continue
		}

		var wta any
		if e.WouldTakeAgainPct != nil {
			wta = *e.WouldTakeAgainPct
		} else {
			wta = nil
		}

		_, err := upsertByExternal.Exec(
			full,
			norm,
			strings.TrimSpace(e.Department),
			e.ID,
			e.AvgRating,
			e.AvgDifficulty,
			e.NumRatings,
			wta,
		)
		if err != nil {
			// If name_normalized UNIQUE collides, update the existing row by name_normalized.
			if strings.Contains(err.Error(), "name_normalized") {
				_, err2 := updateByNormalized.Exec(
					full,
					strings.TrimSpace(e.Department),
					e.ID,
					e.AvgRating,
					e.AvgDifficulty,
					e.NumRatings,
					wta,
					norm,
				)
				if err2 != nil {
					log.Fatal(err2)
				}
				continue
			}
			log.Fatal(err)
		}
	}

	if err := tx.Commit(); err != nil {
		log.Fatal(err)
	}
}
