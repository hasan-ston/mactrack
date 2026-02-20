import { useState, useMemo, useEffect } from "react";
import { Search, Filter, SlidersHorizontal } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Slider } from "../components/ui/slider";
import { Label } from "../components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { courses as mockCourses, Course as MockCourse } from "../data/mockData";
import { CourseCard } from "../components/CourseCard";

export function CourseBrowser() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFaculty, setSelectedFaculty] = useState<string>("all");
  const [selectedTerm, setSelectedTerm] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("code");
  const [minRating, setMinRating] = useState<number[]>([0]);
  const [courses, setCourses] = useState<MockCourse[]>(mockCourses);

  useEffect(() => {
    // fetch from backend API; map DB courses to mock shape with sensible defaults
    const q = encodeURIComponent(searchQuery);
    fetch(`/api/courses?q=${q}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((data: any[]) => {
        const safeData = data || [];
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
        // Clear faculty filter when a new search runs so DB results aren't hidden
        setSelectedFaculty("all");
      })
      .catch((err) => {
        console.error("Failed to fetch courses:", err);
        // Clear courses so mock data doesn't mask the failure
        setCourses([]);
      });
  }, [searchQuery]);

  // Extract unique faculties
  const faculties = useMemo(() => {
    const uniqueFaculties = Array.from(new Set(courses.map(c => c.faculty)));
    return uniqueFaculties.sort();
  }, [courses]);

  // Filter and sort courses
  const filteredCourses = useMemo(() => {
    let filtered = courses.filter(course => {
      const matchesSearch = searchQuery === "" || 
        course.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesFaculty = selectedFaculty === "all" || course.faculty === selectedFaculty;
      const matchesTerm = selectedTerm === "all" || course.term.includes(selectedTerm);
      const matchesRating = course.averageRating >= minRating[0];

      return matchesSearch && matchesFaculty && matchesTerm && matchesRating;
    });

    // Sort
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
  }, [courses, searchQuery, selectedFaculty, selectedTerm, sortBy, minRating]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Browse Courses</h1>
        <p className="text-muted-foreground mt-1">
          Explore {courses.length} courses available at McMaster University
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
                <SheetDescription>
                  Refine your course search
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <div className="space-y-2">
                  <Label>Faculty</Label>
                  <Select value={selectedFaculty} onValueChange={setSelectedFaculty}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Faculties" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Faculties</SelectItem>
                      {faculties.map(faculty => (
                        <SelectItem key={faculty} value={faculty}>{faculty}</SelectItem>
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
          <Label className="text-sm mb-2 block">Faculty</Label>
          <Select value={selectedFaculty} onValueChange={setSelectedFaculty}>
            <SelectTrigger>
              <SelectValue placeholder="All Faculties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Faculties</SelectItem>
              {faculties.map(faculty => (
                <SelectItem key={faculty} value={faculty}>{faculty}</SelectItem>
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

      {/* Results */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {filteredCourses.length} of {courses.length} courses
          </p>
          {(searchQuery || selectedFaculty !== "all" || selectedTerm !== "all" || minRating[0] > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedFaculty("all");
                setSelectedTerm("all");
                setMinRating([0]);
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
      </div>
    </div>
  );
}
