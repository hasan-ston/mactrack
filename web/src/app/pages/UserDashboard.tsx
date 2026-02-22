import { useState, useEffect } from "react";
import { Link } from "react-router";
import { User, BookOpen, Calendar, Star, TrendingUp, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { RatingDisplay } from "../components/RatingDisplay";


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

// Hardcoded until auth is wired up — replace with real user context
const MOCK_USER_ID = 1;
const MOCK_USER_NAME = "John Doe";
const MOCK_USER_EMAIL = "john.doe@mcmaster.ca";
const MOCK_USER_PROGRAM = "Computer Science";
const MOCK_USER_YEAR = 2;

// Total units to graduate — replace with program-specific value once
// the degree planner validation API is wired up
const UNITS_TO_GRADUATE = 120;

// Each McMaster course is typically 3 units — replace once coid is
// linked to the courses table and real unit counts are available
const UNITS_PER_COURSE = 3;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UserDashboard() {
  const [planItems, setPlanItems] = useState<APIPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the user's full plan on mount
  useEffect(() => {
    fetch(`/api/users/${MOCK_USER_ID}/plan`)
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
  }, []);

  // ---------------------------------------------------------------------------
  // Derived stats from real plan data
  // ---------------------------------------------------------------------------

  const completedItems = planItems.filter(pi => pi.status === "COMPLETED");
  const plannedItems = planItems.filter(pi => pi.status === "PLANNED" || pi.status === "IN_PROGRESS");

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
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {MOCK_USER_NAME}
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
                <h2 className="text-2xl font-bold">{MOCK_USER_NAME}</h2>
                <p className="text-muted-foreground">{MOCK_USER_EMAIL}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{MOCK_USER_PROGRAM}</Badge>
                <Badge variant="outline">Year {MOCK_USER_YEAR}</Badge>
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

        {/* Average grade — shown only if any completed items have a grade recorded */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">
                  {completedItems.filter(pi => pi.grade).length > 0
                    ? "–" // placeholder until grade data flows through the API
                    : "–"}
                </div>
                <div className="text-xs text-muted-foreground">Average Grade</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Degree progress                                                       */}
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
            {/* Progress bar width driven by real completed unit count */}
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
      {/* Completed courses                                                     */}
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
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold">
                          {item.subject} {item.course_number}
                        </h3>
                        <Badge variant="secondary">{UNITS_PER_COURSE} units</Badge>
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                          Completed
                        </Badge>
                        {/* Show grade if available */}
                        {item.grade && (
                          <Badge variant="outline">{item.grade}</Badge>
                        )}
                      </div>
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
                <Link
                  key={item.plan_item_id}
                  to={`/courses/${item.subject}/${item.course_number}`}
                >
                  <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-semibold">
                          {item.subject} {item.course_number}
                        </h3>
                        <Badge variant="secondary">{UNITS_PER_COURSE} units</Badge>
                        {/* Show which term this course is planned for */}
                        <Badge variant="outline">
                          {item.season} {new Date().getFullYear() + item.year_index - 1}
                        </Badge>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                      {item.note && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {item.note}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}