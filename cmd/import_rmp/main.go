package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
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

	fmt.Printf("Loaded %d entries from %s\n", len(entries), *jsonPath)
	if len(entries) > 0 {
		e := entries[0]
		fmt.Printf("Example: %s %s (%s) rating=%.1f diff=%.1f n=%d\n",
			e.FirstName, e.LastName, e.Department, e.AvgRating, e.AvgDifficulty, e.NumRatings)
	}
}
