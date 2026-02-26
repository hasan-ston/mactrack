package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	_ "github.com/mattn/go-sqlite3"
)

const (
	// McMaster academic calendar base URL
	baseURL = "https://academiccalendars.romcmaster.ca"
	catoid  = "58"
	dbPath  = "database/courses.db"
	// Conservative delay — the calendar server is slow and we don't want to get blocked
	requestDelay = 400 * time.Millisecond
)

// reCoid extracts the numeric coid from a preview_course.php URL
// e.g. "preview_course.php?catoid=58&coid=123456" → "123456"
var reCoid = regexp.MustCompile(`[?&]coid=(\d+)`)

func main() {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	// WAL mode so reads and writes don't block each other
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		log.Fatalf("set WAL: %v", err)
	}

	// --- Step 1: Load all courses that still have no coid ---
	// We only fetch courses where coid IS NULL so re-runs are safe
	rows, err := db.Query(`
		SELECT id, subject, course_number
		FROM courses
		WHERE coid IS NULL
		ORDER BY subject, course_number
	`)
	if err != nil {
		log.Fatalf("query courses: %v", err)
	}

	type courseEntry struct {
		id           int
		subject      string
		courseNumber string
	}
	var entries []courseEntry
	for rows.Next() {
		var e courseEntry
		if err := rows.Scan(&e.id, &e.subject, &e.courseNumber); err != nil {
			log.Printf("scan: %v", err)
			continue
		}
		entries = append(entries, e)
	}
	rows.Close() // Close before writes to avoid locking

	log.Printf("Found %d courses missing coid — starting backfill", len(entries))

	// --- Step 2: Search the calendar for each course and extract its coid ---
	found := 0
	notFound := 0
	errCount := 0

	for i, e := range entries {
		// Build a keyword like "COMPSCI 2C03" for the search filter
		keyword := fmt.Sprintf("%s %s", e.subject, e.courseNumber)

		coid, err := searchForCoid(keyword)
		if err != nil {
			log.Printf("[%d/%d] %s — search error: %v", i+1, len(entries), keyword, err)
			errCount++
			time.Sleep(requestDelay)
			continue
		}

		if coid == 0 {
			// No result found — log it so we can investigate specific subjects later
			log.Printf("[%d/%d] %s — no coid found in search results", i+1, len(entries), keyword)
			notFound++
			time.Sleep(requestDelay)
			continue
		}

		// Write the coid back to the courses row
		_, err = db.Exec(`UPDATE courses SET coid = ? WHERE id = ?`, coid, e.id)
		if err != nil {
			log.Printf("[%d/%d] %s — update error: %v", i+1, len(entries), keyword, err)
			errCount++
			time.Sleep(requestDelay)
			continue
		}

		log.Printf("[%d/%d] %s — coid=%d ✓", i+1, len(entries), keyword, coid)
		found++

		time.Sleep(requestDelay)
	}

	log.Printf("\nDone. Found: %d  |  Not found: %d  |  Errors: %d", found, notFound, errCount)
	log.Printf("Re-run this command to retry any that errored.")
}

// searchForCoid hits the calendar's advanced search with exact_match=1 for the
// given keyword (e.g. "COMPSCI 2C03") and returns the coid from the first result link.
// Returns 0 if no matching course link is found.
func searchForCoid(keyword string) (int, error) {
	// Build the search URL — mirrors what the browser sends
	// filter[3]=1 includes courses, filter[31]=1 includes course descriptions
	searchURL := fmt.Sprintf(
		"%s/search_advanced.php?cur_cat_oid=%s&ecpage=1&cpage=1&ppage=1&pcpage=1&spage=1&tpage=1"+
			"&search_database=Search"+
			"&filter%%5Bkeyword%%5D=%s"+
			"&filter%%5Bexact_match%%5D=1"+
			"&filter%%5B3%%5D=1"+
			"&filter%%5B31%%5D=1",
		baseURL, catoid, url.QueryEscape(keyword),
	)

	doc, err := goquery.NewDocument(searchURL)
	if err != nil {
		return 0, fmt.Errorf("fetch search page: %w", err)
	}

	// The results page lists courses as links to preview_course.php?catoid=58&coid=XXXXX
	// We want the first link that contains a coid query param
	var foundCoid int
	doc.Find("a[href*='preview_course_nopop.php']").EachWithBreak(func(_ int, s *goquery.Selection) bool {
		href, exists := s.Attr("href")
		if !exists {
			return true // continue
		}

		// Verify the link text roughly matches our subject to avoid wrong-course hits
		// e.g. searching "MATH 1A03" should not match "MATH 1A03 (cross-listed with ARTSSCI 1A03)"
		// We accept any match since exact_match=1 should already filter well
		m := reCoid.FindStringSubmatch(href)
		if m == nil {
			return true // no coid in this link, keep looking
		}

		// Parse the coid string to int
		var coid int
		fmt.Sscanf(m[1], "%d", &coid)
		if coid > 0 {
			foundCoid = coid
			return false // stop iteration — take the first match
		}
		return true
	})

	// If exact_match returned nothing, try verifying the link text contains our subject
	// as a loose sanity check (course codes are unique enough that this rarely misfires)
	if foundCoid == 0 {
		// No results with exact match — caller logs this
		return 0, nil
	}

	// Extra sanity: confirm the first result link text contains our subject
	// so we don't backfill a wrong coid for similarly-named courses
	subject := strings.Fields(keyword)[0]
	firstLinkText := ""
	doc.Find("a[href*='preview_course_nopop.php']").First().Each(func(_ int, s *goquery.Selection) {
		firstLinkText = strings.ToUpper(s.Text())
	})
	if firstLinkText != "" && !strings.Contains(firstLinkText, strings.ToUpper(subject)) {
		log.Printf("  WARNING: first result %q doesn't contain subject %q — skipping to be safe", firstLinkText, subject)
		return 0, nil
	}

	return foundCoid, nil
}
