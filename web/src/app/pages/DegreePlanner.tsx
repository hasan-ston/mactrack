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
import { useAuth } from "../contexts/AuthContext";
import { authFetch } from "../lib/api";
import { unitsFromCourseNumber } from "../lib/courseUtils";
import { subjectColors } from "../data/mockData";

// ---------------------------------------------------------------------------
// Types
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
  course_name: string | null;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "DROPPED";
  grade: string | null;
  note: string | null;
  year_index: number;
  season: "Fall" | "Winter" | "Spring" | "Summer";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERMS = ["Fall", "Winter", "Spring/Summer"] as const;
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR + i);
const UNITS_TO_GRADUATE = 120;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function courseCode(c: APICourse): string {
  return `${c.subject} ${c.course_number}`;
}

function planItemKey(item: APIPlanItem): string {
  return `${item.subject}-${item.course_number}-${item.year_index}-${item.season}`;
}

/** Status badge color mapping */
function statusStyle(status: APIPlanItem["status"]) {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800";
    case "IN_PROGRESS":
      return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800";
    case "DROPPED":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800";
    default: // PLANNED
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800";
  }
}

function levelFromCourseNumber(courseNumber: string): number | null {
  const first = courseNumber.trim()[0];
  const n = parseInt(first, 10);
  return Number.isNaN(n) ? null : n;
}

function seasonFromOfferingTerm(term: string): "Fall" | "Winter" | "Spring" | "Summer" | null {
  const t = term.toLowerCase();
  if (t.includes("fall")) return "Fall";
  if (t.includes("winter")) return "Winter";
  if (t.includes("spring")) return "Spring";
  if (t.includes("summer")) return "Summer";
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DegreePlanner() {
  const { user } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<APICourse[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [selectedCourse, setSelectedCourse] = useState<APICourse | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<string>("Fall");
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [planItems, setPlanItems] = useState<APIPlanItem[]>([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  const [filterSubject, setFilterSubject] = useState<string>("ALL");
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [filterTerm, setFilterTerm] = useState<string>("ALL");

  const subjectOptions = Array.from(new Set(searchResults.map(c => c.subject))).sort((a, b) => a.localeCompare(b));

  const levelOptions = ["1", "2", "3", "4"] as const;
  const termOptions = ["Fall", "Winter", "Spring", "Summer"] as const;

  // Fetch plan on mount
  useEffect(() => {
    if (!user) return;
    setPlanLoading(true);
    authFetch(`/api/users/${user.userID}/plan`)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((data: APIPlanItem[]) => { setPlanItems(data ?? []); setPlanError(null); })
      .catch(err => setPlanError(err.message))
      .finally(() => setPlanLoading(false));
  }, [user]);

  // Course search — debounced; uses limit=50 since results are shown in a dialog
  // The multi-token backend search means "compsci 2" or "software eng" work correctly.
  const searchCourses = useCallback((q: string) => {
    setSearchLoading(true);
    fetch(`/api/courses?q=${encodeURIComponent(q)}&limit=50`)
      .then(res => res.json())
      .then((data: { courses: APICourse[]; total: number }) => {
        const results = data?.courses ?? [];
        const plannedKeys = new Set(
          planItems.map(pi => `${pi.subject}-${pi.course_number}`)
        );
        setSearchResults(
          results.filter(c => !plannedKeys.has(`${c.subject}-${c.course_number}`))
        );
      })
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  }, [planItems]);

  useEffect(() => {
    if (!dialogOpen) return;
    const timer = setTimeout(() => searchCourses(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, dialogOpen, searchCourses]);

  useEffect(() => {
    if (dialogOpen) searchCourses("");
  }, [dialogOpen, searchCourses]);

  useEffect(() => {
    if (!dialogOpen) {
      setFilterSubject("ALL");
      setFilterLevel("ALL");
      setFilterTerm("ALL");
    }
  }, [dialogOpen]);

  // Add course to plan
  const handleAddCourse = async () => {
    if (!selectedCourse || !user) return;
    setMutating(true);

    const yearIndex = selectedYear - CURRENT_YEAR + 1;
    const season = selectedTerm === "Spring/Summer" ? "Spring" : selectedTerm;

    try {
      const res = await authFetch(`/api/users/${user.userID}/plan`, {
        method: "POST",
        body: JSON.stringify({
          subject: selectedCourse.subject,
          course_number: selectedCourse.course_number,
          year_index: yearIndex,
          season,
          status: "PLANNED",
        }),
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      const updated = await authFetch(`/api/users/${user.userID}/plan`).then(r => r.json());
      setPlanItems(updated ?? []);
      setSelectedCourse(null);
      setSearchQuery("");
      setDialogOpen(false);
    } catch (err) {
      console.error("Failed to add course:", err);
    } finally {
      setMutating(false);
    }
  };

  // Remove course from plan
  const handleRemoveCourse = async (item: APIPlanItem) => {
    if (!user) return;
    setMutating(true);
    try {
      await authFetch(`/api/users/${user.userID}/plan/${item.plan_item_id}`, {
        method: "DELETE",
      });
      setPlanItems(prev => prev.filter(pi => pi.plan_item_id !== item.plan_item_id));
    } catch (err) {
      console.error("Failed to remove course:", err);
    } finally {
      setMutating(false);
    }
  };

  // Derived unit totals using real unit values from course number suffixes
  const completedItems = planItems.filter(pi => pi.status === "COMPLETED");
  const unitsCompleted = completedItems.reduce(
    (sum, pi) => sum + unitsFromCourseNumber(pi.course_number), 0
  );
  const unitsPlanned = planItems
    .filter(pi => pi.status === "PLANNED")
    .reduce((sum, pi) => sum + unitsFromCourseNumber(pi.course_number), 0);
  const unitsRemaining = UNITS_TO_GRADUATE - unitsCompleted;

  const getCoursesByYearAndTerm = (year: number, term: string) => {
    const yearIndex = year - CURRENT_YEAR + 1;
    const season = term === "Spring/Summer" ? "Spring" : term;
    return planItems.filter(pi => pi.year_index === yearIndex && pi.season === season);
  };

  const filteredResults = searchResults.filter(c => {
    if (filterSubject !== "ALL" && c.subject !== filterSubject) return false;

    if (filterLevel !== "ALL") {
      const lvl = levelFromCourseNumber(c.course_number);
      if (!lvl || lvl.toString() !== filterLevel) return false;
    }

    if (filterTerm !== "ALL") {
      const s = seasonFromOfferingTerm(c.term);
      if (s !== filterTerm) return false;
    }

    return true;
  });

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
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-8">

      {/* Header + Add Course */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">Degree Planner</h1>
          <p className="text-muted-foreground mt-1">
            Plan your academic journey and track your progress
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-xl shadow-md">
              <Plus className="h-4 w-4" />
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
              <div className="space-y-2">
                <Label>Search Courses</Label>
                <Input
                  placeholder="Search by course code or title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Select value={filterSubject} onValueChange={setFilterSubject}>
                    <SelectTrigger>
                      <SelectValue placeholder="All subjects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All subjects</SelectItem>
                      {subjectOptions.map(subject => (
                        <SelectItem key={subject} value={subject}>
                          {subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Level</Label>
                  <Select value={filterLevel} onValueChange={setFilterLevel}>
                    <SelectTrigger>
                      <SelectValue placeholder="All levels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All levels</SelectItem>
                      {levelOptions.map(level => (
                        <SelectItem key={level} value={level}>
                          Level {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Term</Label>
                  <Select value={filterTerm} onValueChange={setFilterTerm}>
                    <SelectTrigger>
                      <SelectValue placeholder="All terms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All terms</SelectItem>
                      {termOptions.map(season => (
                        <SelectItem key={season} value={season}>
                          {season}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg">
                {searchLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredResults.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No courses found" : (filterSubject !== "ALL" || filterLevel !== "ALL" || filterTerm !== "ALL") ? "No courses match your filters" : "Start typing to search courses"}
                  </p>
                ) : (
                  filteredResults.map(course => {
                    const sc = subjectColors[course.subject] ?? { bg: "bg-gray-100", text: "text-gray-700", darkBg: "dark:bg-gray-900 dark:text-gray-300" };
                    return (
                    <button
                      key={`${course.subject}-${course.course_number}-${course.term}`}
                      onClick={() => setSelectedCourse(course)}
                      className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                        selectedCourse?.id === course.id ? "bg-primary/10 dark:bg-primary/20 border-primary/20" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border border-transparent ${sc.bg} ${sc.text} ${sc.darkBg}`}>
                              {course.subject}
                            </span>
                            <span className="font-medium">{courseCode(course)}</span>
                          </div>
                          <div className="text-sm text-muted-foreground mt-0.5 truncate">{course.course_name}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-xs">
                            {unitsFromCourseNumber(course.course_number)} units
                          </Badge>
                          <Badge variant="secondary">{course.term}</Badge>
                        </div>
                      </div>
                    </button>
                  );
                  })
                )}
              </div>

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
                {mutating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Add to Plan
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-emerald-200 dark:border-emerald-800/40 bg-gradient-to-br from-emerald-50/60 to-card dark:from-emerald-950/20 dark:to-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{unitsCompleted}</div>
                <div className="text-xs text-muted-foreground">Units Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 dark:border-blue-800/40 bg-gradient-to-br from-blue-50/60 to-card dark:from-blue-950/20 dark:to-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{unitsPlanned}</div>
                <div className="text-xs text-muted-foreground">Units Planned</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 dark:border-purple-800/40 bg-gradient-to-br from-purple-50/60 to-card dark:from-purple-950/20 dark:to-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-2xl font-bold">{unitsRemaining}</div>
                <div className="text-xs text-muted-foreground">Units Remaining</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <div className="space-y-8">
        {YEARS.map(year => {
          const yearHasCourses = TERMS.some(term => getCoursesByYearAndTerm(year, term).length > 0);
          return (
          <Card key={year} className={yearHasCourses ? "border-primary/20 dark:border-primary/15" : ""}>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-primary" />
                </div>
                Academic Year {year}–{year + 1}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {TERMS.map(term => {
                  const termCourses = getCoursesByYearAndTerm(year, term);
                  const termUnits = termCourses.reduce(
                    (sum, pi) => sum + unitsFromCourseNumber(pi.course_number), 0
                  );

                  return (
                    <div key={term} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-foreground">{term}</h3>
                        <Badge variant="outline" className="font-medium">{termUnits} units</Badge>
                      </div>

                      <div className="space-y-2.5 min-h-[100px] p-3 border-2 border-dashed border-border/60 dark:border-border/40 rounded-xl bg-muted/30 dark:bg-muted/10">
                        {termCourses.length === 0 ? (
                          <p className="text-center text-sm text-muted-foreground py-8">
                            No courses planned
                          </p>
                        ) : (
                          termCourses.map(item => {
                            const sc = subjectColors[item.subject] ?? { bg: "bg-gray-100", text: "text-gray-700", darkBg: "dark:bg-gray-900 dark:text-gray-300" };
                            return (
                            <div
                              key={planItemKey(item)}
                              className="p-3 bg-card border border-border/80 dark:border-border/50 rounded-xl shadow-sm space-y-2 transition-all hover:shadow-md"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold border border-transparent ${sc.bg} ${sc.text} ${sc.darkBg}`}>
                                      {item.subject}
                                    </span>
                                    <Badge className={`text-[10px] px-1.5 py-0 h-5 border ${statusStyle(item.status)}`}>
                                      {item.status}
                                    </Badge>
                                  </div>
                                  <Link to={`/courses/${item.subject}/${item.course_number}`}>
                                    <div className="font-semibold text-sm hover:text-primary transition-colors">
                                      {item.subject} {item.course_number}
                                    </div>
                                  </Link>
                                  {item.course_name && (
                                    <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                      {item.course_name}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <Select
                                    value={item.status}
                                    onValueChange={async (newStatus) => {
                                      await authFetch(`/api/users/${user!.userID}/plan/${item.plan_item_id}`, {
                                        method: "PATCH",
                                        body: JSON.stringify({ status: newStatus }),
                                      });
                                      const updated = await authFetch(`/api/users/${user!.userID}/plan`).then(r => r.json());
                                      setPlanItems(updated ?? []);
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-28 rounded-lg">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="PLANNED">Planned</SelectItem>
                                      <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                                      <SelectItem value="COMPLETED">Completed</SelectItem>
                                      <SelectItem value="DROPPED">Dropped</SelectItem>
                                    </SelectContent>
                                  </Select>

                                  {item.status === "COMPLETED" && (
                                    <input
                                      type="text"
                                      placeholder="Grade"
                                      defaultValue={item.grade ?? ""}
                                      className="h-7 text-xs px-2 border border-border/80 dark:border-border/50 rounded-lg w-16 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/40"
                                      onBlur={async (e) => {
                                        const grade = e.target.value.trim();
                                        if (!grade) return;
                                        await authFetch(`/api/users/${user!.userID}/plan/${item.plan_item_id}`, {
                                          method: "PATCH",
                                          body: JSON.stringify({ status: "COMPLETED", grade }),
                                        });
                                        const updated = await authFetch(`/api/users/${user!.userID}/plan`).then(r => r.json());
                                        setPlanItems(updated ?? []);
                                      }}
                                    />
                                  )}

                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleRemoveCourse(item)}
                                    disabled={mutating}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>

                              <div className="text-xs text-muted-foreground">
                                {unitsFromCourseNumber(item.course_number)} units
                                {item.grade && (
                                  <> · Grade: <span className="font-medium text-foreground">{item.grade}</span></>
                                )}
                              </div>

                              {item.note && (
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {item.note}
                                </div>
                              )}
                            </div>
                          );})
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
        })}
      </div>

      {/* Planning tips */}
      <Card className="bg-gradient-to-br from-muted/50 to-card border-primary/10 dark:border-primary/10">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="text-primary">💡</span> Planning Tips
          </CardTitle>
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