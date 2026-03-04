import { useState, useEffect } from "react";
import { Link } from "react-router";
import { Search, Star, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Slider } from "../components/ui/slider";
import { Label } from "../components/ui/label";
import { Card, CardContent } from "../components/ui/card";

interface Instructor {
  instructor_id: number;
  name: string;
  department: string;
  external_source: string;
  external_id: string;
  external_url: string;
  avg_rating: number | null;
  avg_difficulty: number | null;
  num_ratings: number | null;
  last_scraped: string;
}

interface InstructorsResponse {
  instructors: Instructor[];
  total: number;
  limit: number;
  offset: number;
}

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

export function BrowseInstructors() {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [minRating, setMinRating] = useState<number[]>([0]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [totalInstructors, setTotalInstructors] = useState(0);
  const [departments, setDepartments] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const PAGE_SIZE = 20;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch departments
  useEffect(() => {
    fetch(`/api/instructors/departments`)
      .then((res) => res.json())
      .then((data) => setDepartments(data))
      .catch(console.error);
  }, []);

  // Fetch instructors
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String((currentPage - 1) * PAGE_SIZE),
    });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (selectedDepartment !== "all") params.set("department", selectedDepartment);
    if (minRating[0] > 0) params.set("min_rating", String(minRating[0]));

    fetch(`/api/instructors?${params}`)
      .then((res) => res.json())
      .then((data: InstructorsResponse) => {
        setInstructors(data.instructors || []);
        setTotalInstructors(data.total || 0);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch instructors:", err);
        setLoading(false);
      });
  }, [debouncedQuery, selectedDepartment, minRating, currentPage]);

  const totalPages = Math.ceil(totalInstructors / PAGE_SIZE);

  return (
    <div className="space-y-6 px-4 py-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Browse Professors</h1>
        <p className="text-muted-foreground mt-1">
          Find and rate professors at McMaster University
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedDepartment} onValueChange={(v) => { setSelectedDepartment(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept}>{dept}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="w-full md:w-[200px] space-y-2">
          <Label>Min Rating: {minRating[0]}</Label>
          <Slider
            value={minRating}
            onValueChange={(v) => { setMinRating(v); setCurrentPage(1); }}
            min={0}
            max={5}
            step={0.5}
          />
        </div>
      </div>

      {/* Results Count */}
      <div className="text-muted-foreground">
        {loading ? "Loading..." : `${totalInstructors} professors found`}
      </div>

      {/* Instructor Grid */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : instructors.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No professors found matching your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {instructors.map((instructor) => (
            <Link key={instructor.instructor_id} to={`/professors/${instructor.instructor_id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="pt-6">
                  <h3 className="font-semibold text-lg">{instructor.name}</h3>
                  <p className="text-sm text-muted-foreground">{instructor.department || "No department"}</p>
                  <div className="mt-4 flex items-center gap-4">
                    {instructor.avg_rating != null ? (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-medium">{instructor.avg_rating.toFixed(1)}</span>
                        <span className="text-muted-foreground text-sm">/ 5</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">No rating</span>
                    )}
                    {instructor.num_ratings != null && (
                      <span className="text-sm text-muted-foreground">
                        {instructor.num_ratings} reviews
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                    <BookOpen className="h-3 w-3" />
                    <span>View courses</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {paginationRange(currentPage, totalPages).map((page, i) => (
            page === "…" ? (
              <span key={`ellipsis-${i}`} className="px-2">…</span>
            ) : (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                size="sm"
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </Button>
            )
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
