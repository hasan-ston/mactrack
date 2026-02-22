import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { Plus, Trash2, GraduationCap, Calendar, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { RatingDisplay } from "../components/RatingDisplay";

// ---------------------------------------------------------------------------
// Types — mirroring what the Go API actually returns
// ---------------------------------------------------------------------------

interface APICourse {
  id: number;
  subject: string;
  course_number: string;
  course_name: string;
  professor: string;
  term: string;
}

interface APIPlanItem {
  plan_item_id: number;
  plan_term_id: number;
  subject: string;
  course_number: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "DROPPED";
  grade: string | null;
  note: string | null;
  // Joined fields returned by GET /api/users/:id/plan
  year_index: number;
  season: "Fall" | "Winter" | "Spring" | "Summer";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERMS = ["Fall", "Winter", "Spring/Summer"] as const;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR + i);

// Hardcoded for now — replace with real user ID from auth context when ready
const MOCK_USER_ID = 1;

// Total units required for graduation — replace with program-specific value
// once the degree planner validation API is wired up
const UNITS_TO_GRADUATE = 120;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Formats a course into a short display code, e.g. "COMPSCI 2C03"
function courseCode(c: APICourse): string {
  return `${c.subject} ${c.course_number}`;
}

// Derives a stable string key from a plan item for React list rendering
function planItemKey(item: APIPlanItem): string {
  return `${item.subject}-${item.course_number}-${item.year_index}-${item.season}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DegreePlanner() {
  // ---- Course search state (dialog) ----
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<APICourse[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ---- Selected course + term in the add dialog ----
  const [selectedCourse, setSelectedCourse] = useState<APICourse | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<string>("Fall");
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [dialogOpen, setDialogOpen] = useState(false);

  // ---- Plan items fetched from the API ----
  const [planItems, setPlanItems] = useState<APIPlanItem[]>([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);

  // ---- Adding / removing loading state ----
  const [mutating, setMutating] = useState(false);

  // --------------------------------------------------------------------------
  // Fetch the user's plan on mount
  // --------------------------------------------------------------------------
  useEffect(() => {
    setPlanLoading(true);
    fetch(`/api/users/${MOCK_USER_ID}/plan`)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((data: APIPlanItem[]) => {
        setPlanItems(data ?? []);
        setPlanError(null);
      })
      .catch(err => setPlanError(err.message))
      .finally(() => setPlanLoading(false));
  }, []);

  // --------------------------------------------------------------------------
  // Search courses — debounced against /api/courses?q=
  // --------------------------------------------------------------------------
  const searchCourses = useCallback((q: string) => {
    setSearchLoading(true);
    fetch(`/api/courses?q=${encodeURIComponent(q)}`)
      .then(res => res.json())
      .then((data: APICourse[]) => {
        // Filter out courses the user has already planned
        const plannedKeys = new Set(
          planItems.map(pi => `${pi.subject}-${pi.course_number}`)
        );
        setSearchResults(
          (data ?? []).filter(c => !plannedKeys.has(`${c.subject}-${c.course_number}`))
        );
      })
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }, [planItems]);

  // Re-run search whenever the query changes (with a small debounce)
  useEffect(() => {
    if (!dialogOpen) return; // don't fetch when dialog is closed
    const timer = setTimeout(() => searchCourses(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, dialogOpen, searchCourses]);

  // Populate search results when dialog first opens
  useEffect(() => {
    if (dialogOpen) searchCourses("");
  }, [dialogOpen, searchCourses]);

  // --------------------------------------------------------------------------
  // Add a course to the plan
  // --------------------------------------------------------------------------
  const handleAddCourse = async () => {
    if (!selectedCourse) return;
    setMutating(true);

    // Map the display year + term into what the API expects
    // year_index: 1-based index (e.g. 2026 → index 1 if CURRENT_YEAR=2026)
    const yearIndex = selectedYear - CURRENT_YEAR + 1;

    // Map "Spring/Summer" display label to "Spring" for the DB CHECK constraint
    const season = selectedTerm === "Spring/Summer" ? "Spring" : selectedTerm;

    try {
      const res = await fetch(`/api/users/${MOCK_USER_ID}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: selectedCourse.subject,
          course_number: selectedCourse.course_number,
          year_index: yearIndex,
          season,
          status: "PLANNED",
        }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      // Re-fetch the plan to get the server-assigned IDs
      const updated = await fetch(`/api/users/${MOCK_USER_ID}/plan`).then(r => r.json());
      setPlanItems(updated ?? []);

      // Reset dialog state
      setSelectedCourse(null);
      setSearchQuery("");
      setDialogOpen(false);
    } catch (err) {
      console.error("Failed to add course:", err);
    } finally {
      setMutating(false);
    }
  };

  // --------------------------------------------------------------------------
  // Remove a course from the plan
  // --------------------------------------------------------------------------
  const handleRemoveCourse = async (item: APIPlanItem) => {
    setMutating(true);
    try {
      await fetch(`/api/users/${MOCK_USER_ID}/plan/${item.plan_item_id}`, {
        method: "DELETE",
      });
      // Optimistic update — remove locally without re-fetching
      setPlanItems(prev => prev.filter(pi => pi.plan_item_id !== item.plan_item_id));
    } catch (err) {
      console.error("Failed to remove course:", err);
    } finally {
      setMutating(false);
    }
  };

  // --------------------------------------------------------------------------
  // Derived credit counts
  // --------------------------------------------------------------------------

  // Each McMaster course is typically 3 units — this will be replaced
  // with real unit data once coid is linked to the courses table
  const UNITS_PER_COURSE = 3;

  const completedItems = planItems.filter(pi => pi.status === "COMPLETED");
  const unitsCompleted = completedItems.length * UNITS_PER_COURSE;
  const unitsPlanned = planItems.filter(pi => pi.status === "PLANNED").length * UNITS_PER_COURSE;
  const unitsRemaining = UNITS_TO_GRADUATE - unitsCompleted;

  // --------------------------------------------------------------------------
  // Filter plan items by year + term for the timeline view
  // --------------------------------------------------------------------------
  const getCoursesByYearAndTerm = (year: number, term: string) => {
    const yearIndex = year - CURRENT_YEAR + 1;
    const season = term === "Spring/Summer" ? "Spring" : term;
    return planItems.filter(
      pi => pi.year_index === yearIndex && pi.season === season
    );
  };

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  if (planLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (planError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-destructive">Failed to load plan: {planError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* ------------------------------------------------------------------ */}
      {/* Header + Add Course button                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Degree Planner</h1>
          <p className="text-muted-foreground mt-1">
            Plan your academic journey and track your progress
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Course
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Course to Plan</DialogTitle>
              <DialogDescription>
                Search and select a course to add to your degree plan
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Search input */}
              <div className="space-y-2">
                <Label>Search Courses</Label>
                <Input
                  placeholder="Search by course code or title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Results list */}
              <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg">
                {searchLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : searchResults.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No courses found" : "Start typing to search courses"}
                  </p>
                ) : (
                  searchResults.map(course => (
                    <button
                      key={`${course.subject}-${course.course_number}-${course.term}`}
                      onClick={() => setSelectedCourse(course)}
                      className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                        selectedCourse?.id === course.id ? "bg-muted" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          {/* Course code e.g. "COMPSCI 2C03" */}
                          <div className="font-medium">{courseCode(course)}</div>
                          <div className="text-sm text-muted-foreground">
                            {course.course_name}
                          </div>
                        </div>
                        <Badge variant="secondary">{course.term}</Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Term + Year selectors */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Term</Label>
                  <Select value={selectedTerm} onValueChange={setSelectedTerm}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TERMS.map(term => (
                        <SelectItem key={term} value={term}>{term}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select
                    value={selectedYear.toString()}
                    onValueChange={(v) => setSelectedYear(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEARS.map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleAddCourse}
                disabled={!selectedCourse || mutating}
              >
                {mutating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Add to Plan
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Summary cards                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{unitsCompleted}</div>
                <div className="text-xs text-muted-foreground">Units Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{unitsPlanned}</div>
                <div className="text-xs text-muted-foreground">Units Planned</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{unitsRemaining}</div>
                <div className="text-xs text-muted-foreground">Units Remaining</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Timeline view                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-8">
        {YEARS.map(year => (
          <Card key={year}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Academic Year {year}–{year + 1}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {TERMS.map(term => {
                  const termCourses = getCoursesByYearAndTerm(year, term);
                  const termUnits = termCourses.length * UNITS_PER_COURSE;

                  return (
                    <div key={term} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{term}</h3>
                        <Badge variant="outline">{termUnits} units</Badge>
                      </div>

                      <div className="space-y-2 min-h-[100px] p-3 border-2 border-dashed rounded-lg bg-muted/20">
                        {termCourses.length === 0 ? (
                          <p className="text-center text-sm text-muted-foreground py-8">
                            No courses planned
                          </p>
                        ) : (
                          termCourses.map(item => (
                            <div
                              key={planItemKey(item)}
                              className="p-3 bg-background border rounded-lg space-y-2"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  {/* Link to course detail — uses subject+number as path */}
                                  <Link to={`/courses/${item.subject}/${item.course_number}`}>
                                    <div className="font-medium hover:text-primary transition-colors">
                                      {item.subject} {item.course_number}
                                    </div>
                                  </Link>
                                  {/* course_name in scope here — item defined by termCourses.map */}
                                  {item.course_name && (
                                    <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                      {item.course_name}
                                    </div>
                                  )}
                                </div>

                                {/* Status badge */}
                                <Badge
                                  variant={item.status === "COMPLETED" ? "default" : "secondary"}
                                  className="text-xs mr-2"
                                >
                                  {item.status}
                                </Badge>

                                {/* Remove button */}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 flex-shrink-0"
                                  onClick={() => handleRemoveCourse(item)}
                                  disabled={mutating}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>

                              {/* Grade if available */}
                              {item.grade && (
                                <div className="text-xs text-muted-foreground">
                                  Grade: {item.grade}
                                </div>
                              )}

                              {/* Note if available */}
                              {item.note && (
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {item.note}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Planning tips                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">Planning Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Aim for 12–15 units per term for a balanced workload</li>
            <li>• Check prerequisites before planning courses</li>
            <li>• Consider course difficulty and professor ratings</li>
            <li>• Balance harder courses with easier ones each term</li>
            <li>• Plan required courses early to avoid scheduling conflicts</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}