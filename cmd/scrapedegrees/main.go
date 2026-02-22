package main

import (
	"database/sql"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery" // HTML parsing
	_ "github.com/mattn/go-sqlite3"  // SQLite driver
)

const (
	baseURL      = "https://academiccalendars.romcmaster.ca"
	catoid       = "58"
	catalogYear  = "2025-2026"
	indexNavoid  = "12628"
	dbPath       = "database/courses.db"
	requestDelay = 500 * time.Millisecond
)

// programEntry holds data harvested from the index page before we fetch each program.
type programEntry struct {
	poid       int
	name       string
	degreeType string
}

func main() {
	// Open the SQLite database (must already have the migration applied).
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	// Enable WAL mode for better write performance.
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		log.Fatalf("set WAL: %v", err)
	}

	// --- Pass 1: collect all poids from the index page ---
	log.Println("Fetching program index…")
	programs, err := scrapeIndex()
	if err != nil {
		log.Fatalf("scrape index: %v", err)
	}
	log.Printf("Found %d programs", len(programs))

	// --- Pass 2: fetch and parse each program page ---
	for i, prog := range programs {
		log.Printf("[%d/%d] poid=%d  %s", i+1, len(programs), prog.poid, prog.name)

		// Skip if already scraped (allows re-running without duplication).
		var exists int
		err := db.QueryRow("SELECT COUNT(*) FROM programs WHERE poid = ?", prog.poid).Scan(&exists)
		if err != nil {
			log.Printf("  check exists: %v — skipping", err)
			continue
		}
		if exists > 0 {
			log.Printf("  already scraped, skipping")
			continue
		}

		programID, groups, courses, err := scrapeProgram(prog)
		if err != nil {
			log.Printf("  scrape error: %v — skipping", err)
			continue
		}

		// Insert everything in a single transaction per program.
		if err := insertProgram(db, programID, groups, courses); err != nil {
			log.Printf("  insert error: %v — skipping", err)
			continue
		}

		time.Sleep(requestDelay)
	}

	log.Println("Done.")
}

func scrapeIndex() ([]programEntry, error) {
	url := fmt.Sprintf("%s/content.php?catoid=%s&navoid=%s", baseURL, catoid, indexNavoid)
	doc, err := fetchDoc(url)
	if err != nil {
		return nil, err
	}

	var entries []programEntry
	var currentDegreeType string

	// The page alternates between <p><strong>Degree Type</strong></p> headings
	// and <ul class="program-list"> blocks. Walk the content area's children.
	doc.Find(".block_content").Children().Each(func(_ int, s *goquery.Selection) {
		// Degree type heading: <p style="padding-left: 30px"><strong>…</strong></p>
		if goquery.NodeName(s) == "p" {
			if text := strings.TrimSpace(s.Find("strong").Text()); text != "" {
				currentDegreeType = text
			}
			return
		}

		// Program list: <ul class="program-list">
		if goquery.NodeName(s) == "ul" && s.HasClass("program-list") {
			s.Find("li a").Each(func(_ int, a *goquery.Selection) {
				href, exists := a.Attr("href")
				if !exists {
					return
				}
				// href looks like: preview_program.php?catoid=58&poid=29661&returnto=12628
				poid := extractQueryParam(href, "poid")
				if poid == 0 {
					return
				}
				entries = append(entries, programEntry{
					poid:       poid,
					name:       strings.TrimSpace(a.Text()),
					degreeType: currentDegreeType,
				})
			})
		}
	})

	return entries, nil
}

type programRow struct {
	poid        int
	name        string
	degreeType  string
	totalUnits  *int // pointer so we can store NULL when absent
	catalogYear string
}

// groupRow mirrors the requirement_groups table.
type groupRow struct {
	tempID          int  // local ID assigned during parsing (not the DB autoincrement)
	parentTempID    *int // nil if root
	displayOrder    int
	heading         string
	headingLevel    int
	unitsRequired   *int
	coursesRequired *int
	isElective      bool
	isContainer     bool
}

// courseRow mirrors the requirement_courses table.
type courseRow struct {
	groupTempID  int // which groupRow this belongs to
	displayOrder int
	coid         *int
	courseCode   string
	courseName   string
	isOrWithNext bool
	adhocText    string // empty string = not an adhoc row
}

// scrapeProgram fetches one program page and returns parsed data ready to insert.
func scrapeProgram(prog programEntry) (programRow, []groupRow, []courseRow, error) {
	url := fmt.Sprintf("%s/preview_program.php?catoid=%s&poid=%d", baseURL, catoid, prog.poid)
	doc, err := fetchDoc(url)
	if err != nil {
		return programRow{}, nil, nil, err
	}

	pr := programRow{
		poid:        prog.poid,
		name:        prog.name,
		degreeType:  prog.degreeType,
		catalogYear: catalogYear,
	}

	// Parse "N units total" from the program_description div, if present.
	doc.Find(".program_description p").Each(func(_ int, s *goquery.Selection) {
		if u := parseUnitsFromText(s.Text()); u > 0 {
			pr.totalUnits = &u
		}
	})

	var groups []groupRow
	var courses []courseRow
	tempIDCounter := 0

	doc.Find(".acalog-core").Each(func(_ int, s *goquery.Selection) {
		heading := strings.TrimSpace(s.Children().First().Text())
		if !strings.EqualFold(heading, "requirements") {
			return
		}
		// Found the Requirements block — parse it recursively.
		parseGroupNode(s, nil, &groups, &courses, &tempIDCounter, 0)
	})

	return pr, groups, courses, nil
}

func parseGroupNode(
	node *goquery.Selection,
	parentTempID *int,
	groups *[]groupRow,
	courses *[]courseRow,
	counter *int,
	siblingOrder int,
) {
	// The first child of an acalog-core div is always its heading (h2–h5).
	headingEl := node.Children().First()
	headingTag := goquery.NodeName(headingEl)

	// Only process h2–h5 elements as group headings.
	level := headingLevel(headingTag)
	if level == 0 {
		return
	}

	headingText := strings.TrimSpace(headingEl.Text())

	// Assign a local temp ID for this group.
	*counter++
	myTempID := *counter

	// Determine if this group is purely a container (has child .acalog-core divs
	// but no direct <ul> course list).
	hasChildGroups := node.Find(".acalog-core").Length() > 0
	hasCourseList := node.Children().Filter("ul").Length() > 0 ||
		node.Find("> .custom_leftpad_20 > ul").Length() > 0

	isContainer := hasChildGroups && !hasCourseList

	// Parse units/courses from the heading text.
	unitsReq := parseUnitsFromText(headingText)
	coursesReq := parseCoursesFromText(headingText)

	g := groupRow{
		tempID:       myTempID,
		parentTempID: parentTempID,
		displayOrder: siblingOrder,
		heading:      headingText,
		headingLevel: level,
		isContainer:  isContainer,
	}
	if unitsReq > 0 {
		g.unitsRequired = &unitsReq
	}
	if coursesReq > 0 {
		g.coursesRequired = &coursesReq
	}

	// Parse any direct <ul> course list belonging to this group.
	// McMaster wraps the list directly inside the acalog-core or inside a
	// .custom_leftpad_20 child — check both.
	courseList := node.Children().Filter("ul")
	if courseList.Length() == 0 {
		courseList = node.Find("> div > ul").First()
	}

	courseOrder := 0
	isElective := false

	courseList.Find("li").Each(func(_ int, li *goquery.Selection) {
		courseOrder++

		switch {
		case li.HasClass("acalog-course"):
			// A specific, named course with a coid in its onClick handler.
			anchor := li.Find("a")
			onClick, _ := anchor.Attr("onclick")
			coidVal := extractCoidFromOnClick(onClick)

			// Course code + name live in the aria-label: "View course details for CODE - Name"
			ariaLabel, _ := anchor.Attr("aria-label")
			code, name := parseCourseAriaLabel(ariaLabel)

			cr := courseRow{
				groupTempID:  myTempID,
				displayOrder: courseOrder,
				courseCode:   code,
				courseName:   name,
			}
			if coidVal > 0 {
				cr.coid = &coidVal
			}
			*courses = append(*courses, cr)

		case li.HasClass("acalog-adhoc-before"):
			// Text like "ENGINEER 1A00 or" — signals the next course is an OR alternative.
			// Mark the last inserted course for this group as is_or_with_next.
			for i := len(*courses) - 1; i >= 0; i-- {
				if (*courses)[i].groupTempID == myTempID {
					(*courses)[i].isOrWithNext = true
					break
				}
			}

		case li.HasClass("acalog-adhoc-after"):
			// Free-text description of an alternative, e.g. "List G approved electives".
			cr := courseRow{
				groupTempID:  myTempID,
				displayOrder: courseOrder,
				adhocText:    strings.TrimSpace(li.Text()),
			}
			*courses = append(*courses, cr)

		default:
			// Plain <li> with no special class — check if it's a generic "Electives" label.
			text := strings.TrimSpace(li.Text())
			if strings.EqualFold(text, "electives") || strings.HasPrefix(strings.ToLower(text), "elective") {
				isElective = true
			} else if text != "" {
				// Treat as adhoc free-text (some programs describe options this way).
				cr := courseRow{
					groupTempID:  myTempID,
					displayOrder: courseOrder,
					adhocText:    text,
				}
				*courses = append(*courses, cr)
			}
		}
	})

	g.isElective = isElective
	*groups = append(*groups, g)

	// Recurse into child .acalog-core divs (each is a sub-group).
	childOrder := 0
	node.Find("> .custom_leftpad_20 > .acalog-core, > .acalog-core").Each(func(_ int, child *goquery.Selection) {
		// Skip the node itself (goquery may match the parent).
		if child.IsSelection(node) {
			return
		}
		childOrder++
		parseGroupNode(child, &myTempID, groups, courses, counter, childOrder)
	})
}

// --------------------------------------------------------------------------
// Database insertion
// --------------------------------------------------------------------------

// insertProgram writes one program and all its groups/courses in a single transaction.
// tempID values are resolved to real autoincrement IDs as we insert.
func insertProgram(db *sql.DB, pr programRow, groups []groupRow, courses []courseRow) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() // no-op if Commit succeeds

	// Insert the program row.
	res, err := tx.Exec(
		`INSERT INTO programs (poid, name, degree_type, total_units, catalog_year)
		 VALUES (?, ?, ?, ?, ?)`,
		pr.poid, pr.name, pr.degreeType, pr.totalUnits, pr.catalogYear,
	)
	if err != nil {
		return fmt.Errorf("insert program poid=%d: %w", pr.poid, err)
	}
	programID, _ := res.LastInsertId()

	// Insert groups in order, resolving tempID → real DB ID.
	// We process groups in slice order, which is pre-order (parent before children)
	// because parseGroupNode appends the parent before recursing.
	tempToReal := make(map[int]int64) // tempID → real group_id

	for _, g := range groups {
		var parentID *int64
		if g.parentTempID != nil {
			real := tempToReal[*g.parentTempID]
			parentID = &real
		}

		res, err := tx.Exec(
			`INSERT INTO requirement_groups
			   (program_id, parent_group_id, display_order, heading, heading_level,
			    units_required, courses_required, is_elective, is_container)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			programID, parentID, g.displayOrder, g.heading, g.headingLevel,
			g.unitsRequired, g.coursesRequired,
			boolToInt(g.isElective), boolToInt(g.isContainer),
		)
		if err != nil {
			return fmt.Errorf("insert group %q: %w", g.heading, err)
		}
		realID, _ := res.LastInsertId()
		tempToReal[g.tempID] = realID
	}

	// Insert course rows, using the resolved group IDs.
	for _, c := range courses {
		realGroupID := tempToReal[c.groupTempID]

		var adhocPtr *string
		if c.adhocText != "" {
			adhocPtr = &c.adhocText
		}

		_, err := tx.Exec(
			`INSERT INTO requirement_courses
			   (group_id, display_order, coid, course_code, course_name,
			    is_or_with_next, adhoc_text)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			realGroupID, c.displayOrder, c.coid, c.courseCode, c.courseName,
			boolToInt(c.isOrWithNext), adhocPtr,
		)
		if err != nil {
			return fmt.Errorf("insert course %q: %w", c.courseCode, err)
		}
	}

	return tx.Commit()
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

// fetchDoc performs an HTTP GET and returns a parsed goquery document.
func fetchDoc(url string) (*goquery.Document, error) {
	// Use goquery's built-in NewDocument which calls http.Get internally.
	doc, err := goquery.NewDocument(url)
	if err != nil {
		return nil, fmt.Errorf("fetch %s: %w", url, err)
	}
	return doc, nil
}

// headingLevel converts an HTML tag name to its numeric depth, or 0 if not a heading.
func headingLevel(tag string) int {
	switch tag {
	case "h2":
		return 2
	case "h3":
		return 3
	case "h4":
		return 4
	case "h5":
		return 5
	}
	return 0
}

var reUnits = regexp.MustCompile(`^(\d+)\s+units?`)

// parseUnitsFromText extracts the leading integer from strings like "27 units" or "3 units from".
func parseUnitsFromText(s string) int {
	s = strings.TrimSpace(strings.ToLower(s))
	m := reUnits.FindStringSubmatch(s)
	if m == nil {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

var reCourses = regexp.MustCompile(`^(\d+)\s+courses?`)

// parseCoursesFromText extracts the leading integer from strings like "2 courses".
func parseCoursesFromText(s string) int {
	s = strings.TrimSpace(strings.ToLower(s))
	m := reCourses.FindStringSubmatch(s)
	if m == nil {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

var reCoid = regexp.MustCompile(`showCourse\('[^']*',\s*'(\d+)'`)

// extractCoidFromOnClick pulls the coid integer from a showCourse() onclick attribute.
// e.g. onClick="showCourse('58', '291432', this, ...)" → 291432
func extractCoidFromOnClick(onClick string) int {
	m := reCoid.FindStringSubmatch(onClick)
	if m == nil {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

var reAriaLabel = regexp.MustCompile(`View course details for ([A-Z/]+ \w+)\s+-\s+(.+?)\s*$`)

// parseCourseAriaLabel splits "View course details for COMPSCI 2C03 - Data Structures and Algorithms"
// into ("COMPSCI 2C03", "Data Structures and Algorithms").
func parseCourseAriaLabel(label string) (code, name string) {
	m := reAriaLabel.FindStringSubmatch(strings.TrimSpace(label))
	if m == nil {
		return "", strings.TrimSpace(label)
	}
	return strings.TrimSpace(m[1]), strings.TrimSpace(m[2])
}

var rePoid = regexp.MustCompile(`[?&]poid=(\d+)`)

// extractQueryParam pulls an integer param from a URL fragment like "preview_program.php?catoid=58&poid=29661".
func extractQueryParam(href, param string) int {
	re := regexp.MustCompile(`[?&]` + regexp.QuoteMeta(param) + `=(\d+)`)
	m := re.FindStringSubmatch(href)
	if m == nil {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

// boolToInt converts a Go bool to SQLite's 0/1 convention.
func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
