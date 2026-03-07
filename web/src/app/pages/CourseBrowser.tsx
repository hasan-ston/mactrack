import { useState, useMemo, useEffect } from "react";
import { useLocation } from "react-router";
import { Search, Filter, SlidersHorizontal, X, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Slider } from "../components/ui/slider";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { courses as mockCourses, Course as MockCourse } from "../data/mockData";
import { CourseCard } from "../components/CourseCard";
import { unitsFromCourseNumber } from "../lib/courseUtils";

const PAGE_SIZE = 20;

// Returns the page numbers (and "…" gap markers) to render in the pagination bar.
// Always includes page 1, page total, and a ±2 window around the current page.
// May insert "…" markers to represent gaps between non-contiguous page ranges.
function paginationRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const visible = new Set<number>([1, total]);
  for (let d = -2; d <= 2; d++) {
    const p = current + d;
    if (p > 1 && p < total) visible.add(p);
  }

  const sorted = [...visible].sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
    result.push(sorted[i]);
  }
  return result;
}

export function CourseBrowser() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const location = useLocation();

  // Initialize search query from URL `?search=` param so direct links and
  // client-side navigation from Home pick it up immediately.
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search || "");
      const q = params.get("search") || "";
      setSearchQuery(q);
      setDebouncedQuery(q);
    } catch (e) {
      // ignore malformed URLSearchParams
    }
  }, [location.search]);

  // Debounce search input — wait 300 ms before sending to the API
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1); // reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // selectedLevel holds "1000", "2000", "3000", "4000", or "all"
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [selectedTerm, setSelectedTerm] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("code");
  const [minRating, setMinRating] = useState<number[]>([0]);

  const [courses, setCourses] = useState<MockCourse[]>(mockCourses);
  // Seed totalCourses with mockCourses.length so the header count is non-zero
  // before the first API response replaces it with the real backend total.
  const [totalCourses, setTotalCourses] = useState(mockCourses.length);
  const [currentPage, setCurrentPage] = useState(1);

  // Handler functions update filter + reset page in one React 18 batch so
  // only a single fetch fires (no double-fetch from separate page-reset effect).
  const handleLevelChange = (level: string) => {
    setSelectedLevel(level);
    setCurrentPage(1);
  };
  const handleTermChange = (term: string) => {
    setSelectedTerm(term);
    setCurrentPage(1);
  };

  // Fetch courses from the server with level and term as URL params.
  // These filters are applied in the SQL WHERE clause so the server returns
  // the correctly-filtered total and page — not just a filtered slice of one page.
  useEffect(() => {
    const offset = (currentPage - 1) * PAGE_SIZE;
    const params = new URLSearchParams();
    params.set("q", debouncedQuery);
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    if (selectedLevel !== "all") params.set("level", selectedLevel);
    if (selectedTerm !== "all") params.set("term", selectedTerm);

    fetch(`/api/courses?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((data: { courses: any[]; total: number }) => {
        const safeData = data?.courses || [];
        const mapped: MockCourse[] = safeData.map((c) => ({
          id: String(c.id),
          code: `${c.subject} ${c.course_number}`,
          title: c.course_name || "",
          faculty: c.subject || "",
          subject: c.subject || "",
          credits: unitsFromCourseNumber(c.course_number),
          description: c.course_name || "",
          prerequisites: [],
          term: c.term || "",
          averageRating: c.avg_rating ?? 0,
          difficulty: c.avg_difficulty ?? 0,
          reviewCount: c.num_ratings ?? 0,
          professors: c.professor ? [c.professor] : [],
          classAverage: 0,
        }));
        setCourses(mapped);
        setTotalCourses(data?.total ?? 0);
      })
      .catch((err) => {
        console.error("Failed to fetch courses:", err);
        setCourses([]);
        setTotalCourses(0);
      });
  }, [debouncedQuery, currentPage, selectedLevel, selectedTerm]);

  const totalPages = Math.max(1, Math.ceil(totalCourses / PAGE_SIZE));

  // All 4 standard course levels. Since level is now a server-side filter,
  // we always show all options rather than deriving them from the current page.
  const ALL_LEVELS = ["1", "2", "3", "4"];

  // Client-side: sort + minimum-rating filter only.
  // Level and term are server-side so pagination is always correct.
  const filteredCourses = useMemo(() => {
    const filtered = courses.filter(course => course.averageRating >= minRating[0]);
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "code":
          return a.code.localeCompare(b.code);
        case "rating":
          return b.averageRating - a.averageRating;
        case "difficulty":
          return a.difficulty - b.difficulty;
        case "reviews":
          return b.reviewCount - a.reviewCount;
        default:
          return 0;
      }
    });
  }, [courses, sortBy, minRating]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const hasFilters = searchQuery || selectedLevel !== "all" || selectedTerm !== "all" || minRating[0] > 0;

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedLevel("all");
    setSelectedTerm("all");
    setMinRating([0]);
    setCurrentPage(1);
  };

  return (
    <div className="container mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-3xl md:text-4xl font-bold text-foreground">Browse Courses</h1>
        <p className="text-muted-foreground mt-1">
          Explore <span className="font-semibold text-foreground">{totalCourses}</span> courses available at McMaster University
        </p>
      </motion.div>

      {/* Search + sort row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search by code, title, or description…"
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="code">Course Code</SelectItem>
              <SelectItem value="rating">Highest Rated</SelectItem>
              <SelectItem value="difficulty">Easiest First</SelectItem>
              <SelectItem value="reviews">Most Reviews</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={filtersOpen ? "default" : "outline"}
            size="icon"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-label="Toggle filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Collapsible filter panel */}
      {filtersOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="flex flex-wrap gap-6 p-5 bg-muted/50 border border-border rounded-xl"
        >
          <div className="flex-1 min-w-[160px] space-y-2">
            <Label className="text-sm">Course Level</Label>
            <Select value={selectedLevel} onValueChange={handleLevelChange}>
              <SelectTrigger>
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {ALL_LEVELS.map(level => (
                  <SelectItem key={level} value={level}>{level}-Level ({level}xxx)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[160px] space-y-2">
            <Label className="text-sm">Term</Label>
            <Select value={selectedTerm} onValueChange={handleTermChange}>
              <SelectTrigger>
                <SelectValue placeholder="All Terms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Terms</SelectItem>
                <SelectItem value="Fall">Fall</SelectItem>
                <SelectItem value="Winter">Winter</SelectItem>
                <SelectItem value="Spring/Summer">Spring/Summer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[160px] space-y-2">
            <Label className="text-sm">Minimum Rating: {minRating[0].toFixed(1)}</Label>
            <Slider
              value={minRating}
              onValueChange={setMinRating}
              min={0}
              max={5}
              step={0.5}
              className="mt-2"
            />
          </div>

          {hasFilters && (
            <div className="flex items-end">
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                <X className="h-3.5 w-3.5 mr-1.5" />
                Clear Filters
              </Button>
            </div>
          )}
        </motion.div>
      )}

      {/* Active filter chips */}
      {hasFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {searchQuery && (
            <Badge variant="secondary" className="gap-1.5 cursor-pointer" onClick={() => setSearchQuery("")}>
              Search: "{searchQuery}" <X className="h-3 w-3" />
            </Badge>
          )}
          {selectedLevel !== "all" && (
            <Badge variant="secondary" className="gap-1.5 cursor-pointer" onClick={() => handleLevelChange("all")}>
              Level: {selectedLevel}-Level <X className="h-3 w-3" />
            </Badge>
          )}
          {selectedTerm !== "all" && (
            <Badge variant="secondary" className="gap-1.5 cursor-pointer" onClick={() => handleTermChange("all")}>
              Term: {selectedTerm} <X className="h-3 w-3" />
            </Badge>
          )}
          {minRating[0] > 0 && (
            <Badge variant="secondary" className="gap-1.5 cursor-pointer" onClick={() => setMinRating([0])}>
              Min Rating: {minRating[0].toFixed(1)} <X className="h-3 w-3" />
            </Badge>
          )}
        </div>
      )}

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{filteredCourses.length}</span> of{" "}
        <span className="font-semibold text-foreground">{totalCourses}</span> courses
        {totalPages > 1 && ` · page ${currentPage} of ${totalPages}`}
      </div>

      {/* Course grid */}
      {filteredCourses.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20"
        >
          <Filter className="h-14 w-14 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No courses found</h3>
          <p className="text-muted-foreground mb-6">Try adjusting your filters or search query</p>
          <Button variant="outline" onClick={clearFilters}>Clear All Filters</Button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course, i) => (
            <motion.div
              key={course.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(i * 0.05, 0.4) }}
            >
              <CourseCard course={course} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          {paginationRange(currentPage, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground">…</span>
            ) : (
              <Button
                key={p}
                variant={currentPage === p ? "default" : "outline"}
                size="sm"
                className="w-9"
                onClick={() => setCurrentPage(p as number)}
              >
                {p}
              </Button>
            )
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}