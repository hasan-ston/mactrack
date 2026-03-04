import { useState, useEffect } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, Users, Star, TrendingUp, Clock, CheckCircle2, BarChart3 } from "lucide-react";
import { AddToPlannerDialog } from "../components/AddToPlannerDialog";
import { unitsFromCourseNumber } from "../lib/courseUtils";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Separator } from "../components/ui/separator";
import { Progress } from "../components/ui/progress";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Shape returned by GET /api/courses/:id
interface ApiCourse {
  id: number;
  subject: string;
  course_number: string;
  course_name: string;
  professor: string;
  term: string;
}

// Shape returned by GET /api/courses/:subject/:number/requisites
interface RequisiteRow {
  req_subject: string;
  req_course_number: string;
  kind: string;
}

interface RequisitesResponse {
  PREREQ: RequisiteRow[];
  COREQ: RequisiteRow[];
  ANTIREQ: RequisiteRow[];
}

interface Instructor {
  instructor_id: number;
  name: string;
  department: string;
  avg_rating: number | null;
  avg_difficulty: number | null;
  num_ratings: number | null;
  external_url: string;
}

// Cleans up the professor field from the courses table.
// The DB stores multiple professors delimited by \u000a (newline),
// and sometimes duplicates the same name — this handles both cases.
const formatProfessors = (professorString: string | null | undefined): string => {
  if (!professorString) return "—";

  return [
    ...new Set(                          // Remove duplicate names
      professorString
        .split(/,?\\u000a|,/)                // courses.professor uses \u000a as delimiter
        .map((name) => name.trim())      // Clean surrounding whitespace
        .filter((name) => name !== "")   // Drop empty segments
    ),
  ].join(", ");
};

export function CourseDetail() {
  const { courseId, subject, courseNumber } = useParams();

  // Real course data from the API
  const [course, setCourse] = useState<ApiCourse | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [courseNotFound, setCourseNotFound] = useState(false);

  // Requisites from the API
  const [requisites, setRequisites] = useState<RequisitesResponse | null>(null);
  const [requisitesLoading, setRequisitesLoading] = useState(false);

  const [isAdded, setIsAdded] = useState(false);

  // Instructor RMP data
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [instructorsLoading, setInstructorsLoading] = useState(false);

  // Step 3: fetch instructor RMP data for this course
  useEffect(() => {
    if (!course) return;

    setInstructorsLoading(true);

    // Use the dedicated backend endpoint that queries course_instructors
    fetch(`${API_BASE}/api/courses/${course.id}/instructors`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((data: Instructor[]) => {
        setInstructors(data || []);
      })
      .catch((err) => console.error("Failed to fetch instructors:", err))
      .finally(() => setInstructorsLoading(false));
  }, [course]);

  // Step 1: fetch the course by its numeric DB id
  useEffect(() => {
    setCourseLoading(true);

    // Support two URL shapes:
    // /courses/:id                     (from CourseBrowser)
    // /courses/:subject/:courseNumber  (from DegreePlanner)
    const url = courseId
      ? `/api/courses/${courseId}`
      : `/api/courses/${subject}/${courseNumber}`;

    fetch(url)
      .then(res => {
        if (res.status === 404) { setCourseNotFound(true); return null; }
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((data: ApiCourse | ApiCourse[] | null) => {
        if (!data) return;
        // /api/courses?q= returns an array — take the exact match
        if (Array.isArray(data)) {
          const match = data.find(
            c => c.subject === subject && c.course_number === courseNumber
          );
          if (match) setCourse(match);
          else setCourseNotFound(true);
        } else {
          setCourse(data);
        }
      })
      .catch(err => console.error("Failed to fetch course:", err))
      .finally(() => setCourseLoading(false));
  }, [courseId, subject, courseNumber]);

  // Step 2: once we have subject + course_number, fetch requisites
  useEffect(() => {
    if (!course) return;

    setRequisitesLoading(true);
    fetch(`/api/courses/${course.subject}/${course.course_number}/requisites`)
      .then(res => res.json())
      .then((data: RequisitesResponse) => setRequisites(data))
      .catch(err => console.error("Failed to fetch requisites:", err))
      .finally(() => setRequisitesLoading(false));
  }, [course]);

  // Loading state
  if (courseLoading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Loading course...</p>
      </div>
    );
  }

  // 404 / not found state
  if (courseNotFound || !course) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Course Not Found</h2>
        <p className="text-muted-foreground mb-4">
          The course you're looking for doesn't exist.
        </p>
        <Button asChild>
          <Link to="/courses">Browse Courses</Link>
        </Button>
      </div>
    );
  }

  // Determine if there are any requisites to show
  const hasRequisites =
    requisites &&
    (requisites.PREREQ.length > 0 ||
      requisites.COREQ.length > 0 ||
      requisites.ANTIREQ.length > 0);

  // Helper to render one group (PREREQ / COREQ / ANTIREQ) of requisite rows
  const renderRequisiteGroup = (rows: RequisiteRow[], label: string, description: string) => {
    if (!rows || rows.length === 0) return null;
    return (
      <div className="space-y-2">
        <div>
          <h4 className="font-medium">{label}</h4>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-2">
          {rows.map((req, i) => (
            <div key={i} className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
              <Badge variant="outline" className="font-mono">
                {req.req_subject} {req.req_course_number}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Placeholder distribution — real grade data not in DB yet
  const ratingDistribution = [
    { stars: 5, count: 0, percentage: 0 },
    { stars: 4, count: 0, percentage: 0 },
    { stars: 3, count: 0, percentage: 0 },
    { stars: 2, count: 0, percentage: 0 },
    { stars: 1, count: 0, percentage: 0 },
  ];

  // Pre-format professors once so all three render sites stay in sync
  const formattedProfessors = formatProfessors(course.professor);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Back Button */}
      <Button asChild variant="ghost" size="sm">
        <Link to="/courses">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Courses
        </Link>
      </Button>

      {/* Course Header */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-bold">{course.subject} {course.course_number}</h1>
              <Badge variant="secondary">{unitsFromCourseNumber(course.course_number)} Credits</Badge>
            </div>
            <h2 className="text-2xl text-muted-foreground">{course.course_name}</h2>
            <p className="text-sm text-muted-foreground">{course.subject}</p>
          </div>

          <div className="flex gap-2">
            {isAdded ? (
              <Button asChild variant="secondary">
                <Link to="/planner">
                  <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                  View in Planner
                </Link>
              </Button>
            ) : (
              <AddToPlannerDialog
                subject={course.subject}
                courseNumber={course.course_number}
                courseName={course.course_name}
                onAdded={() => setIsAdded(true)}
              />
            )}
          </div>
        </div>

        {/* Quick Stats — shows RMP data from linked instructors when available */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-[#ffc845]" />
                <div>
                  <div className="text-2xl font-bold text-primary">
                    {instructors.length > 0 && instructors.some(i => i.avg_rating != null)
                      ? (instructors.reduce((sum, i) => sum + (i.avg_rating ?? 0), 0) / instructors.filter(i => i.avg_rating != null).length).toFixed(1)
                      : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {instructors.length > 0 && instructors.some(i => i.avg_rating != null)
                      ? "Prof Rating"
                      : "No reviews yet"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-2xl font-bold text-primary">—</div>
                  <div className="text-xs text-muted-foreground">Class Average</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-2xl font-bold text-primary">
                    {instructors.length > 0 && instructors.some(i => i.avg_difficulty != null)
                      ? (instructors.reduce((sum, i) => sum + (i.avg_difficulty ?? 0), 0) / instructors.filter(i => i.avg_difficulty != null).length).toFixed(1)
                      : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {instructors.length > 0 && instructors.some(i => i.avg_difficulty != null)
                      ? "Difficulty"
                      : "Difficulty"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-xl font-bold text-primary">{course.term || "—"}</div>
                  <div className="text-xs text-muted-foreground">Term</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
          <TabsTrigger value="professors">Professors</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Description — using course_name as fallback since full description isn't in DB */}
          <Card>
            <CardHeader>
              <CardTitle>Course Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {course.course_name || "No description available."}
              </p>
            </CardContent>
          </Card>

          {/* Requisites — fetched from real API */}
          <Card>
            <CardHeader>
              <CardTitle>Requisites</CardTitle>
              <CardDescription>Prerequisites, corequisites, and antirequisites</CardDescription>
            </CardHeader>
            <CardContent>
              {requisitesLoading && (
                <p className="text-sm text-muted-foreground">Loading requisites...</p>
              )}

              {!requisitesLoading && !hasRequisites && (
                <p className="text-sm text-muted-foreground">No requisites for this course.</p>
              )}

              {!requisitesLoading && hasRequisites && (
                <div className="space-y-5">
                  {renderRequisiteGroup(
                    requisites!.PREREQ,
                    "Prerequisites",
                    "Must be completed before enrolling"
                  )}
                  {renderRequisiteGroup(
                    requisites!.COREQ,
                    "Corequisites",
                    "Must be taken at the same time"
                  )}
                  {renderRequisiteGroup(
                    requisites!.ANTIREQ,
                    "Antirequisites",
                    "Cannot be taken if you have credit for these"
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Course Details */}
          <Card>
            <CardHeader>
              <CardTitle>Course Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Term:</span>
                <span className="font-medium">{course.term || "—"}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Professor:</span>
                {/* formatProfessors deduplicates and joins \u000a-delimited names */}
                <span className="font-medium">{formattedProfessors}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subject:</span>
                <span className="font-medium">{course.subject}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rating Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="text-center space-y-2">
                  <div className="text-5xl font-bold">—</div>
                  <p className="text-sm text-muted-foreground">No reviews yet</p>
                </div>
                <div className="space-y-2">
                  {ratingDistribution.map(({ stars, count, percentage }) => (
                    <div key={stars} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-12">{stars} stars</span>
                      <Progress value={percentage} className="flex-1" />
                      <span className="text-sm text-muted-foreground w-12 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              No reviews yet. Be the first to review this course!
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="professors" className="space-y-4">
          {instructorsLoading ? (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                Loading professor information...
              </CardContent>
            </Card>
          ) : instructors.length > 0 ? (
            <div className="space-y-4">
              {instructors.map((instructor) => (
                <Card key={instructor.instructor_id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Users className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-semibold">{instructor.name}</h3>
                          <Link to={`/professors/${instructor.instructor_id}`}>
                            <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                              View Profile
                            </Badge>
                          </Link>
                        </div>
                        {instructor.department && (
                          <p className="text-sm text-muted-foreground">{instructor.department}</p>
                        )}
                        
                        {/* RMP Ratings */}
                        <div className="mt-3 flex items-center gap-6">
                          {instructor.avg_rating != null ? (
                            <div className="flex items-center gap-1">
                              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                              <span className="font-semibold">{instructor.avg_rating.toFixed(1)}</span>
                              <span className="text-muted-foreground">/ 5.0</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">No rating</span>
                          )}
                          {instructor.num_ratings != null && (
                            <span className="text-sm text-muted-foreground">
                              {instructor.num_ratings} reviews
                            </span>
                          )}
                          {instructor.avg_difficulty != null && (
                            <div className="flex items-center gap-1">
                              <BarChart3 className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">
                                {instructor.avg_difficulty.toFixed(1)} difficulty
                              </span>
                            </div>
                          )}
                        </div>
                        
                        {instructor.external_url && (
                          <a
                            href={instructor.external_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline mt-2 inline-block"
                          >
                            View on RateMyProfessors →
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : course.professor ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    {/* Use the formatted string so the Professors tab matches the Overview tab */}
                    <h3 className="text-lg font-semibold">{formattedProfessors}</h3>
                    <p className="text-sm text-muted-foreground">{course.subject}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  No RMP ratings available for this professor.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No professor information available for this course.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}