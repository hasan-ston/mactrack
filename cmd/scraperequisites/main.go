package main

import (
	"database/sql"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
	_ "github.com/mattn/go-sqlite3"
)

const (
	// Base URL for the McMaster academic calendar
	baseURL = "https://academiccalendars.romcmaster.ca"
	catoid  = "58"
	dbPath  = "database/courses.db"
	// Delay between requests to avoid hammering the server
	requestDelay = 300 * time.Millisecond
)

// requisiteRow holds one parsed row for the requisites table
type requisiteRow struct {
	subject         string
	courseNumber    string
	reqSubject      string
	reqCourseNumber string
	kind            string // PREREQ, COREQ, or ANTIREQ
	note            string
}

// courseCode is a parsed subject + number from a string like "COMPSCI 2C03"
type courseCode struct {
	subject      string
	courseNumber string
}

// reCourseCode matches patterns like "COMPSCI 2C03", "ART 1HS0", "ENGINEER 1A00"
var reCourseCode = regexp.MustCompile(`([A-Z][A-Z/]+)\s+([0-9][A-Z0-9]+)`)

func main() {
	// Open the SQLite database
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	// Enable WAL mode for better concurrent write performance
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		log.Fatalf("set WAL: %v", err)
	}

	// --- Step 1: Read all distinct coids + course codes from courses ---
	rows, err := db.Query(`
		SELECT DISTINCT coid, subject || ' ' || course_number
		FROM courses
		WHERE coid IS NOT NULL
		`)
	if err != nil {
		log.Fatalf("query coids: %v", err)
	}

	// Collect into memory first to avoid holding a read cursor during writes
	type coidEntry struct {
		coid       int
		courseCode string
	}
	var entries []coidEntry
	for rows.Next() {
		var e coidEntry
		if err := rows.Scan(&e.coid, &e.courseCode); err != nil {
			log.Printf("scan: %v", err)
			continue
		}
		entries = append(entries, e)
	}
	rows.Close() // Close explicitly before any writes


	log.Printf("Found %d courses with coids to scrape", len(entries))

	// --- Step 2: Fetch each course page and parse requisites ---
	successCount := 0
	skipCount := 0

	for i, entry := range entries {

		// Parse the source course's subject + number from course_code
		src := parseCourseCode(entry.courseCode)
		if src.subject == "" {
			log.Printf("[%d/%d] Could not parse course code %q — skipping", i+1, len(entries), entry.courseCode)
			continue
		}

		// Skip if we already have requisites for this course (allows safe re-runs)
		var exists int
		err := db.QueryRow(`
			SELECT COUNT(*) FROM requisites 
			WHERE subject = ? AND course_number = ?
		`, src.subject, src.courseNumber).Scan(&exists)
		if err != nil {
			log.Printf("[%d/%d] check exists: %v — skipping", i+1, len(entries), err)
			continue
		}
		if exists > 0 {
			skipCount++
			continue
		}

		log.Printf("[%d/%d] coid=%d  %s %s", i+1, len(entries), entry.coid, src.subject, src.courseNumber)

		// Fetch and parse the course detail page
		reqs, err := scrapeCourseRequisites(entry.coid, src)
		if err != nil {
			log.Printf("  scrape error: %v — skipping", err)
			continue
		}

		if len(reqs) == 0 {
			log.Printf("  no requisites found")
			continue
		}

		// Insert all requisite rows for this course
		for _, req := range reqs {
			// Skip self-referential rows — the DB constraint rejects them and
			// McMaster often lists the course itself in its own antirequisites
			if req.reqSubject == req.subject && req.reqCourseNumber == req.courseNumber {
				continue
			}

			_, err := db.Exec(`
				INSERT INTO requisites (subject, course_number, req_subject, req_course_number, kind, note)
				VALUES (?, ?, ?, ?, ?, ?)
			`, req.subject, req.courseNumber, req.reqSubject, req.reqCourseNumber, req.kind, req.note)
			if err != nil {
				log.Printf("  insert error for %s %s → %s %s: %v",
					req.subject, req.courseNumber, req.reqSubject, req.reqCourseNumber, err)
				continue
			}
			successCount++
		}

		time.Sleep(requestDelay)
	}

	log.Printf("Done. Inserted %d requisite rows. Skipped %d already-scraped courses.", successCount, skipCount)
}

// scrapeCourseRequisites fetches the course detail page for the given coid
// and parses all PREREQ, COREQ, and ANTIREQ entries.
func scrapeCourseRequisites(coid int, src courseCode) ([]requisiteRow, error) {
	url := fmt.Sprintf("%s/preview_course.php?catoid=%s&coid=%d", baseURL, catoid, coid)
	doc, err := goquery.NewDocument(url)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", url, err)
	}

	var results []requisiteRow

	// Walk all <strong> tags — McMaster labels requisites as:
	// <strong>Prerequisite(s):</strong> COMPSCI 1MD3, MATH 1B03
	// <strong>Corequisite(s):</strong> ...
	// <strong>Antirequisite(s):</strong> ...
	doc.Find("strong").Each(func(_ int, s *goquery.Selection) {
		label := strings.TrimSpace(s.Text())

		// Determine requisite kind from the label
		var kind string
		switch {
		case strings.HasPrefix(strings.ToLower(label), "prerequisite"):
			kind = "PREREQ"
		case strings.HasPrefix(strings.ToLower(label), "corequisite"):
			kind = "COREQ"
		case strings.HasPrefix(strings.ToLower(label), "antirequisite"):
			kind = "ANTIREQ"
		default:
			return // Not a requisite label, skip
		}

		// The requisite text follows the <strong> tag as a sibling text node.
		// Parent().Text() returns the entire parent element's text, which may
		// include multiple requisite sections concatenated together.
		parentText := strings.TrimSpace(s.Parent().Text())

		// TrimPrefix only works if label is at position 0 of parentText.
		// For pages where both <strong> tags share a large parent element,
		// the label is buried mid-string — so we use Index to find it
		// wherever it actually appears, then slice from there.
		labelIdx := strings.Index(parentText, label)
		if labelIdx < 0 {
			return
		}
		reqText := strings.TrimSpace(parentText[labelIdx+len(label):])
		if reqText == "" {
			return
		}

		// Truncate reqText at the start of any OTHER requisite label.
		// Without this, a Prerequisite block whose parent contains the
		// Antirequisite section too would cause ANTIREQ course codes to be
		// incorrectly inserted as PREREQ rows (and vice versa).
		for _, stopWord := range []string{
			"Prerequisite(s):", "Corequisite(s):", "Antirequisite(s):",
			"Prerequisite:", "Corequisite:", "Antirequisite:",
		} {
			// Don't truncate at our own label
			if strings.EqualFold(stopWord, label) {
				continue
			}
			if idx := strings.Index(reqText, stopWord); idx >= 0 {
				reqText = reqText[:idx]
			}
		} // stopWord loop ends here — truncation is complete before regex runs

		// Pre-process: strip McMaster section-variant suffixes like "A/B" or "A/B/C".
		// These appear in two forms:
		//   - With space:    "ENGINEER 1P13 A/B" → regex captures "1P13" correctly but leaves noise
		//   - Without space: "ENGINEER 1P13A/B"  → regex wrongly captures "1P13A", this fixes it
		// We find a digit followed by optional whitespace + single-letter/slash pattern
		// and keep only the digit, discarding the section suffix.
		reVariantSuffix := regexp.MustCompile(`([0-9])\s*(?:[A-Z]/)+[A-Z]`)
		reqText = reVariantSuffix.ReplaceAllStringFunc(reqText, func(match string) string {
			// Keep only the leading digit, discard the section suffix (e.g. " A/B")
			return string(match[0])
		})

		// Parse individual course codes out of the cleaned, truncated text.
		// Text looks like: "COMPSCI 1MD3, MATH 1B03 and STATS 2D03"
		// This runs once per requisite section, after all truncation and cleaning.
		codes := reCourseCode.FindAllStringSubmatch(reqText, -1)
		for _, m := range codes {
			results = append(results, requisiteRow{
				subject:         src.subject,
				courseNumber:    src.courseNumber,
				reqSubject:      m[1],
				reqCourseNumber: m[2],
				kind:            kind,
				note:            "", // Note parsing can be added later if needed
			})
		}
	}) // .Each() callback ends here

	return results, nil
}

// parseCourseCode splits a string like "COMPSCI 2C03" into subject + courseNumber.
func parseCourseCode(code string) courseCode {
	m := reCourseCode.FindStringSubmatch(strings.TrimSpace(code))
	if m == nil {
		return courseCode{}
	}
	return courseCode{subject: m[1], courseNumber: m[2]}
}