import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router";
import { Search, Filter, SlidersHorizontal, X } from "lucide-react";
import { motion } from "motion/react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { courses as allCourses } from "../data/mockData";
import { CourseCard } from "../components/CourseCard";

export function CourseBrowser() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") ?? "");
  const [selectedLevel, setSelectedLevel] = useState("all");
  const [selectedTerm, setSelectedTerm] = useState("all");
  const [sortBy, setSortBy] = useState("code");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Sync search query to URL
  useEffect(() => {
    const q = searchQuery.trim();
    if (q) setSearchParams({ search: q }, { replace: true });
    else setSearchParams({}, { replace: true });
  }, [searchQuery]);

  const filteredCourses = useMemo(() => {
    let filtered = allCourses.filter((course) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        course.code.toLowerCase().includes(q) ||
        course.title.toLowerCase().includes(q) ||
        course.description.toLowerCase().includes(q) ||
        course.subject.toLowerCase().includes(q);

      const courseNum = course.code.split(" ")[1] ?? "";
      const matchesLevel = selectedLevel === "all" || courseNum.startsWith(selectedLevel[0]);
      const matchesTerm = selectedTerm === "all" || course.term.includes(selectedTerm);

      return matchesSearch && matchesLevel && matchesTerm;
    });

    filtered.sort((a, b) => {
      if (sortBy === "rating") return b.averageRating - a.averageRating;
      if (sortBy === "difficulty") return a.difficulty - b.difficulty;
      if (sortBy === "reviews") return b.reviewCount - a.reviewCount;
      return a.code.localeCompare(b.code);
    });

    return filtered;
  }, [searchQuery, selectedLevel, selectedTerm, sortBy]);

  const hasFilters = searchQuery || selectedLevel !== "all" || selectedTerm !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedLevel("all");
    setSelectedTerm("all");
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
          Explore <span className="font-semibold text-foreground">{allCourses.length}</span> courses available at McMaster University
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
            <Select value={selectedLevel} onValueChange={setSelectedLevel}>
              <SelectTrigger>
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="1">1-Level (1xxx)</SelectItem>
                <SelectItem value="2">2-Level (2xxx)</SelectItem>
                <SelectItem value="3">3-Level (3xxx)</SelectItem>
                <SelectItem value="4">4-Level (4xxx)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[160px] space-y-2">
            <Label className="text-sm">Term</Label>
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
            <Badge variant="secondary" className="gap-1.5 cursor-pointer" onClick={() => setSelectedLevel("all")}>
              Level: {selectedLevel}-Level <X className="h-3 w-3" />
            </Badge>
          )}
          {selectedTerm !== "all" && (
            <Badge variant="secondary" className="gap-1.5 cursor-pointer" onClick={() => setSelectedTerm("all")}>
              Term: {selectedTerm} <X className="h-3 w-3" />
            </Badge>
          )}
        </div>
      )}

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{filteredCourses.length}</span> of{" "}
        <span className="font-semibold text-foreground">{allCourses.length}</span> courses
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
    </div>
  );
}
