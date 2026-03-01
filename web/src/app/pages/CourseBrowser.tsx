import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation } from "react-router";
import { Search, Filter, SlidersHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Slider } from "../components/ui/slider";
import { Label } from "../components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { courses as mockCourses, Course as MockCourse } from "../data/mockData";
import { CourseCard } from "../components/CourseCard";

const PAGE_SIZE = 20;

// Returns the page numbers (and "…" gap markers) to render in the pagination bar.
// Always includes page 1, page total, and a ±2 window around current.
// Never allocates more than 7 entries regardless of how large total is.
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

  const fetchCourses = useCallback((query: string, page: number) => {
    const offset = (page - 1) * PAGE_SIZE;
    const url = `/api/courses?q=${encodeURIComponent(query)}&limit=${PAGE_SIZE}&offset=${offset}`;
    fetch(url)
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
          credits: 3,
          description: c.course_name || "",
          prerequisites: [],
          term: c.term || "",
          averageRating: 0,
          difficulty: 0,
          reviewCount: 0,
          professors: c.professor ? [c.professor] : [],
          classAverage: 0,
        }));
        setCourses(mapped);
        setTotalCourses(data?.total ?? 0);
        // Reset level filter when a new search runs so results aren't hidden
        setSelectedLevel("all");
      })
      .catch((err) => {
        console.error("Failed to fetch courses:", err);
        setCourses([]);
        setTotalCourses(0);
      });
  }, []);

  useEffect(() => {
    fetchCourses(debouncedQuery, currentPage);
  }, [debouncedQuery, currentPage, fetchCourses]);

  const totalPages = Math.max(1, Math.ceil(totalCourses / PAGE_SIZE));

  // Derive which levels actually exist in the current result set
  // e.g. if search returns no 4000-level courses, don't show that option
  const availableLevels = useMemo(() => {
    const levels = ["1", "2", "3", "4"];
    return levels.filter(level =>
      courses.some(c => c.code.split(" ")[1]?.startsWith(level[0]))
    );
  }, [courses]);

  // Filter and sort courses client-side after API fetch
  const filteredCourses = useMemo(() => {
    let filtered = courses.filter(course => {
      // Level filter: check if course_number starts with the level's first digit
      // e.g. "2000" level matches course codes like "2C03", "2AA3", "2EE3"
      const courseNumber = course.code.split(" ")[1] || "";
      const matchesLevel = selectedLevel === "all" || courseNumber.startsWith(selectedLevel[0]);
      const matchesTerm = selectedTerm === "all" || course.term.includes(selectedTerm);
      const matchesRating = course.averageRating >= minRating[0];
      return matchesLevel && matchesTerm && matchesRating;
    });

    filtered.sort((a, b) => {
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

    return filtered;
  }, [courses, selectedLevel, selectedTerm, sortBy, minRating]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Browse Courses</h1>
        <p className="text-muted-foreground mt-1">
          Explore {totalCourses} courses available at McMaster University
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by course code, title, or description..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="code">Course Code</SelectItem>
              <SelectItem value="rating">Highest Rated</SelectItem>
              <SelectItem value="difficulty">Easiest First</SelectItem>
              <SelectItem value="reviews">Most Reviews</SelectItem>
            </SelectContent>
          </Select>

          {/* Mobile Filters */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden">
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Refine your course search</SheetDescription>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Select value={selectedLevel} onValueChange={setSelectedLevel}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Levels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      {availableLevels.map(level => (
                        <SelectItem key={level} value={level}>{level}-level</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Term</Label>
                  <Select value={selectedTerm} onValueChange={setSelectedTerm}>
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

                <div className="space-y-2">
                  <Label>Minimum Rating: {minRating[0].toFixed(1)}</Label>
                  <Slider
                    value={minRating}
                    onValueChange={setMinRating}
                    min={0}
                    max={5}
                    step={0.5}
                    className="mt-2"
                  />
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Desktop Filters */}
      <div className="hidden md:flex gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="flex-1">
          <Label className="text-sm mb-2 block">Level</Label>
          <Select value={selectedLevel} onValueChange={setSelectedLevel}>
            <SelectTrigger>
              <SelectValue placeholder="All Levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              {availableLevels.map(level => (
                <SelectItem key={level} value={level}>{level}-level</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <Label className="text-sm mb-2 block">Term</Label>
          <Select value={selectedTerm} onValueChange={setSelectedTerm}>
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

        <div className="flex-1">
          <Label className="text-sm mb-2 block">
            Minimum Rating: {minRating[0].toFixed(1)}
          </Label>
          <Slider
            value={minRating}
            onValueChange={setMinRating}
            min={0}
            max={5}
            step={0.5}
            className="mt-3"
          />
        </div>
      </div>

      {/* Results count + clear filters */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filteredCourses.length < courses.length
              // Client-side filters narrowed the current page — be explicit about scope
              ? `${filteredCourses.length} of ${courses.length} on this page · ${totalCourses} total`
              // No client filters — show a clean page-range summary
              : `${totalCourses} total${totalPages > 1 ? ` · page ${currentPage} of ${totalPages}` : ""}`
            }
          </p>
          {(searchQuery || selectedLevel !== "all" || selectedTerm !== "all" || minRating[0] > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedLevel("all");
                setSelectedTerm("all");
                setMinRating([0]);
                setCurrentPage(1);
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>

        {filteredCourses.length === 0 ? (
          <div className="text-center py-12">
            <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No courses found</h3>
            <p className="text-muted-foreground">
              Try adjusting your filters or search query
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map(course => (
              <CourseCard key={course.id} course={course} />
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

            {/* Page number chips — show first, last, and a ±2 window around
                 currentPage. Never materialises more than 7 entries regardless
                 of how large totalPages is. */}
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
    </div>
  );
}