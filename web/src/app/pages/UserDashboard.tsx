import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  User, BookOpen, Calendar, Star, TrendingUp, Loader2,
  CheckCircle2, XCircle, AlertCircle, HelpCircle, ChevronDown, ChevronUp
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../contexts/AuthContext";
import { authFetch } from "../lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  season: string;
}

interface APIProgram {
  program_id: number;
  name: string;
  degree_type: string;
  total_units: number | null;
}

// Mirrors the Go ValidationResult / GroupResult structs
interface GroupResult {
  heading: string;
  satisfied: boolean;
  units_completed: number;
  units_required: number;
  missing_courses: string[];
}

interface PrereqWarning {
  course: string;
  missing_prereq: string;
}

interface ValidationResult {
  total_units_required: number;
  total_units_completed: number;
  units_remaining: number;
  groups: GroupResult[];
  prereq_warnings: PrereqWarning[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNITS_TO_GRADUATE = 120;
const UNITS_PER_COURSE = 3;

// ---------------------------------------------------------------------------
// Sub-component: DegreeValidation
// Fetches and renders the full validation breakdown.
// Kept separate so its loading state doesn't block the rest of the dashboard.
// ---------------------------------------------------------------------------

function DegreeValidation({ userID, programName }: { userID: number; programName: string }) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track which groups are expanded — default all collapsed
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    // Step 1: find the program_id by matching user.program name against /api/programs
    authFetch("/api/programs")
      .then(res => {
        if (!res.ok) throw new Error(`Programs fetch returned ${res.status}`);
        return res.json() as Promise<APIProgram[]>;
      })
      .then(programs => {
        const match = programs.find(p =>
          p.name.toLowerCase().includes(programName.toLowerCase()) ||
          programName.toLowerCase().includes(p.name.toLowerCase())
        );
        if (!match) throw new Error(`No program found matching "${programName}"`);
        return match.program_id;
      })
      .then(programID =>
        authFetch(`/api/users/${userID}/validation?program_id=${programID}`)
      )
      .then(res => {
        if (!res.ok) throw new Error(`Validation returned ${res.status}`);
        return res.json() as Promise<ValidationResult>;
      })
      .then(data => {
        setValidation(data);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [userID, programName]);

  const toggleGroup = (index: number) =>
    setExpanded(prev => ({ ...prev, [index]: !prev[index] }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
        <span className="text-muted-foreground text-sm">Checking your requirements…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive py-6 justify-center">
        <AlertCircle className="h-5 w-5" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  if (!validation) return null;

  const satisfiedCount = validation.groups.filter(g => g.satisfied).length;
  const totalGroups = validation.groups.length;
  const progressPercent = totalGroups > 0
    ? Math.round((satisfiedCount / totalGroups) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Overall progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Requirements Satisfied</span>
          <span className="font-medium">{satisfiedCount} / {totalGroups} groups</span>
        </div>
        <Progress value={progressPercent} />
      </div>

      {/* Unit summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="text-xl font-bold text-green-600">{validation.total_units_completed}</div>
          <div className="text-xs text-muted-foreground">Completed</div>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="text-xl font-bold">{validation.total_units_required}</div>
          <div className="text-xs text-muted-foreground">Required</div>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="text-xl font-bold text-orange-500">{validation.units_remaining}</div>
          <div className="text-xs text-muted-foreground">Remaining</div>
        </div>
      </div>

      {/* Prereq warnings — shown prominently if any exist */}
      {validation.prereq_warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-400 font-medium text-sm">
            <AlertCircle className="h-4 w-4" />
            Prerequisite Warnings ({validation.prereq_warnings.length})
          </div>
          {validation.prereq_warnings.map((w, i) => (
            <div key={i} className="text-sm text-muted-foreground ml-6">
              <span className="font-medium text-foreground">{w.course}</span>
              {" "}requires{" "}
              <span className="font-medium text-foreground">{w.missing_prereq}</span>
              {" "}which isn't completed yet
            </div>
          ))}
        </div>
      )}

      {/* Requirement groups — collapsible list */}
      <div className="space-y-2">
        {validation.groups.map((group, i) => (
          <div key={i} className="border rounded-lg overflow-hidden">
            {/* Group header — always visible, click to expand */}
            <button
              onClick={() => toggleGroup(i)}
              className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {group.satisfied ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                ) : group.units_completed > 0 ? (
                  <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                ) : group.missing_courses.length === 0 ? (
                  <HelpCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                )}
                <span className="text-sm font-medium truncate">{group.heading}</span>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                {group.units_required > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {group.units_completed}/{group.units_required} units
                  </span>
                )}
                <Badge
                  variant={group.satisfied ? "default" : "outline"}
                  className={group.satisfied
                    ? "bg-green-500/20 text-green-700 border-green-500/30 dark:text-green-400"
                    : group.units_completed > 0
                      ? "bg-yellow-500/10 text-yellow-700 border-yellow-500/30 dark:text-yellow-400"
                      : ""}
                >
                  {group.satisfied ? "Done" : group.units_completed > 0 ? "Partial" : "Missing"}
                </Badge>
                {group.missing_courses.length > 0 && (
                  expanded[i]
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {/* Missing courses — shown when expanded */}
            {expanded[i] && group.missing_courses.length > 0 && (
              <div className="border-t px-4 py-3 bg-muted/20">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Still needed:</p>
                <div className="flex flex-wrap gap-2">
                  {group.missing_courses.map((code, j) => (
                    <Link
                      key={j}
                      to={`/courses/${code.split(" ")[0]}/${code.split(" ")[1]}`}
                    >
                      <Badge
                        variant="outline"
                        className="text-xs hover:bg-primary/10 transition-colors cursor-pointer"
                      >
                        {code}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard component
// ---------------------------------------------------------------------------

export function UserDashboard() {
  const { user } = useAuth();

  const [planItems, setPlanItems] = useState<APIPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---- Mark Complete dialog state ----
  // completingItem holds the plan item currently being marked complete.
  // gradeInput holds the grade string typed by the user (optional).
  const [completingItem, setCompletingItem] = useState<APIPlanItem | null>(null);
  const [gradeInput, setGradeInput] = useState("");
  const [markingLoading, setMarkingLoading] = useState(false);

  // Fetch the user's full plan on mount
  useEffect(() => {
    if (!user) return;
    authFetch(`/api/users/${user.userID}/plan`)
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json();
      })
      .then((data: APIPlanItem[]) => {
        setPlanItems(data ?? []);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [user]);

  // ---------------------------------------------------------------------------
  // Mark a planned course as COMPLETED with an optional grade.
  // Calls PATCH /api/users/:id/plan/:itemId with { status, grade }.
  // On success, updates the item locally without a full re-fetch.
  // ---------------------------------------------------------------------------
  const handleMarkComplete = async () => {
    if (!completingItem || !user) return;
    setMarkingLoading(true);

    try {
      const res = await authFetch(
        `/api/users/${user.userID}/plan/${completingItem.plan_item_id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "COMPLETED",
            // Send null if no grade entered, otherwise send the trimmed string
            grade: gradeInput.trim() !== "" ? gradeInput.trim() : null,
          }),
        }
      );

      if (!res.ok) throw new Error(`Server returned ${res.status}`);

      // Optimistic update — flip the item locally without re-fetching
      setPlanItems(prev =>
        prev.map(pi =>
          pi.plan_item_id === completingItem.plan_item_id
            ? {
                ...pi,
                status: "COMPLETED",
                grade: gradeInput.trim() !== "" ? gradeInput.trim() : null,
              }
            : pi
        )
      );

      // Reset dialog state
      setCompletingItem(null);
      setGradeInput("");
    } catch (err) {
      console.error("Failed to mark course complete:", err);
    } finally {
      setMarkingLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived stats
  // ---------------------------------------------------------------------------

  const completedItems = planItems.filter(pi => pi.status === "COMPLETED");
  const plannedItems = planItems.filter(
    pi => pi.status === "PLANNED" || pi.status === "IN_PROGRESS"
  );

  const unitsCompleted = completedItems.length * UNITS_PER_COURSE;
  const unitsPlanned = plannedItems.length * UNITS_PER_COURSE;
  const unitsRemaining = UNITS_TO_GRADUATE - unitsCompleted;
  const progressPercent = Math.min((unitsCompleted / UNITS_TO_GRADUATE) * 100, 100);

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-destructive">Failed to load dashboard: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* ------------------------------------------------------------------ */}
      {/* Mark Complete dialog                                                 */}
      {/* Opens when the user clicks "Mark Complete" on a planned course.     */}
      {/* ------------------------------------------------------------------ */}
      <Dialog
        open={!!completingItem}
        onOpenChange={(open) => {
          // Reset dialog state when closed
          if (!open) {
            setCompletingItem(null);
            setGradeInput("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as Complete</DialogTitle>
            <DialogDescription>
              {completingItem
                ? `Mark ${completingItem.subject} ${completingItem.course_number} as completed.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Grade input — optional */}
            <div className="space-y-2">
              <Label htmlFor="grade-input">Grade (optional)</Label>
              <Input
                id="grade-input"
                placeholder="e.g. A+, 85, 11"
                value={gradeInput}
                onChange={(e) => setGradeInput(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={handleMarkComplete}
                disabled={markingLoading}
              >
                {markingLoading
                  ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  : <CheckCircle2 className="h-4 w-4 mr-2" />
                }
                Confirm
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setCompletingItem(null);
                  setGradeInput("");
                }}
                disabled={markingLoading}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {user?.displayName}
          </p>
        </div>
        <Button asChild>
          <Link to="/planner">
            <Calendar className="h-4 w-4 mr-2" />
            View Degree Planner
          </Link>
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Profile card                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto md:mx-0">
              <User className="h-12 w-12 text-primary" />
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-2xl font-bold">{user?.displayName}</h2>
                <p className="text-muted-foreground">
                  {user?.program || user?.yearOfStudy
                    ? [user?.program, user?.yearOfStudy ? `Year ${user.yearOfStudy}` : null]
                        .filter(Boolean)
                        .join(" · ")
                    : user?.email}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{unitsCompleted} Units Completed</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Stats                                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{completedItems.length}</div>
                <div className="text-xs text-muted-foreground">Courses Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{plannedItems.length}</div>
                <div className="text-xs text-muted-foreground">Courses Planned</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-400" />
              <div>
                <div className="text-2xl font-bold">{unitsCompleted}</div>
                <div className="text-xs text-muted-foreground">Total Units</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">–</div>
                <div className="text-xs text-muted-foreground">Average Grade</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Degree Progress                                                       */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Degree Progress</CardTitle>
          <CardDescription>Track your progress towards graduation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Units Completed</span>
              <span className="font-medium">{unitsCompleted} / {UNITS_TO_GRADUATE}</span>
            </div>
            <Progress value={progressPercent} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{unitsCompleted}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{unitsPlanned}</div>
              <div className="text-sm text-muted-foreground">Planned</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{unitsRemaining}</div>
              <div className="text-sm text-muted-foreground">Remaining</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Requirement Validation                                               */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Requirement Breakdown</CardTitle>
          <CardDescription>
            {user?.program
              ? `Checking your completed courses against ${user.program}`
              : "Set your program in your profile to see requirement tracking"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user?.program ? (
            <DegreeValidation userID={user.userID} programName={user.program} />
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No program selected. Update your profile to enable requirement tracking.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Completed courses                                                    */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Completed Courses</CardTitle>
              <CardDescription>Courses you have successfully completed</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/courses">Browse Courses</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {completedItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No completed courses yet. Start planning your academic journey!
              </p>
            ) : (
              completedItems.map(item => (
                <Link
                  key={item.plan_item_id}
                  to={`/courses/${item.subject}/${item.course_number}`}
                >
                  <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold">
                        {item.subject} {item.course_number}
                      </h3>
                      <Badge variant="secondary">{UNITS_PER_COURSE} units</Badge>
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                        Completed
                      </Badge>
                      {item.grade && (
                        <Badge variant="outline">{item.grade}</Badge>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Planned courses                                                       */}
      {/* Each card has a "Mark Complete" button that opens the dialog above.  */}
      {/* We stop the Link's click from firing when the button is clicked.     */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Planned Courses</CardTitle>
              <CardDescription>Courses you plan to take</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/planner">Manage Plan</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {plannedItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No courses planned yet. Visit the degree planner to get started!
              </p>
            ) : (
              plannedItems.map(item => (
                <div
                  key={item.plan_item_id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  {/* Left side — course info, wrapped in a Link */}
                  <Link
                    to={`/courses/${item.subject}/${item.course_number}`}
                    className="flex items-center gap-3 flex-wrap flex-1 min-w-0"
                  >
                    <h3 className="font-semibold">
                      {item.subject} {item.course_number}
                    </h3>
                    <Badge variant="secondary">{UNITS_PER_COURSE} units</Badge>
                    <Badge variant="outline">
                      {item.season} {new Date().getFullYear() + item.year_index - 1}
                    </Badge>
                    <Badge variant="outline">{item.status}</Badge>
                  </Link>

                  {/* Right side — Mark Complete button.
                      stopPropagation prevents the Link from navigating when clicked. */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-4 flex-shrink-0 text-green-600 border-green-500/30 hover:bg-green-500/10"
                    onClick={(e) => {
                      e.preventDefault(); // prevent Link navigation
                      setCompletingItem(item);
                      setGradeInput(item.grade ?? "");
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    Mark Complete
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}