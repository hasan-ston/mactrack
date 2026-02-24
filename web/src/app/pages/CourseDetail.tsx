import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { ArrowLeft, BookOpen, Users, Star, TrendingUp, Clock } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Separator } from "../components/ui/separator";
import { Progress } from "../components/ui/progress";

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
  const navigate = useNavigate();

  // Step 1: fetch the course by its numeric DB id
 useEffect(() => {
  setCourseLoading(true);

  // Support two URL shapes:
  // /courses/:id          (from CourseBrowser)
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
              <Badge variant="secondary">3 Credits</Badge>
            </div>
            <h2 className="text-2xl text-muted-foreground">{course.course_name}</h2>
            <p className="text-sm text-muted-foreground">{course.subject}</p>
          </div>

          <div className="flex gap-2">
            {isAdded ? (
              <Button asChild variant="secondary">
                <Link to="/planner">Added to Planner</Link>
              </Button>
            ) : (
              <Button
                onClick={() => {
                  // TODO: call backend to persist planned course
                  setIsAdded(true);
                  navigate("/planner");
                }}
                variant="default"
              >
                Add to Planner
              </Button>
            )}
          </div>
        </div>

        {/* Quick Stats — placeholders for data not yet in DB */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-[#ffc845]" />
                <div>
                  <div className="text-2xl font-bold text-primary">—</div>
                  <div className="text-xs text-muted-foreground">No reviews yet</div>
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
                <BookOpen className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-2xl font-bold text-primary">—</div>
                  <div className="text-xs text-muted-foreground">Difficulty</div>
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
                <span className="font-medium">{course.professor || "—"}</span>
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
          {course.professor ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{course.professor}</h3>
                    <p className="text-sm text-muted-foreground">{course.subject}</p>
                  </div>
                </div>
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