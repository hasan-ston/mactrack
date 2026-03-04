import { useParams, Link } from "react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Users, Star, BookOpen } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface Course {
  id: number;
  subject: string;
  course_number: string;
  course_name: string;
  professor: string;
  term: string;
}

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

interface InstructorWithCourses extends Instructor {
  courses: Course[];
}

export function ProfessorProfile() {
  const { professorId } = useParams();
  const [instructor, setInstructor] = useState<InstructorWithCourses | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!professorId) return;

    fetch(`${API_BASE}/api/instructors/${professorId}?courses=true`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Professor not found");
          }
          throw new Error("Failed to fetch professor");
        }
        return res.json();
      })
      .then((data: InstructorWithCourses) => {
        setInstructor(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [professorId]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !instructor) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Professor Not Found</h2>
        <p className="text-muted-foreground mb-4">
          {error || "The professor profile you're looking for doesn't exist."}
        </p>
        <Button asChild>
          <Link to="/professors">Browse Professors</Link>
        </Button>
      </div>
    );
  }

  const courses = instructor.courses || [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back Button */}
      <Button asChild variant="ghost" size="sm">
        <Link to="/professors">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Professors
        </Link>
      </Button>

      {/* Professor Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="h-32 w-32 rounded-full bg-muted flex items-center justify-center mx-auto md:mx-0">
              <Users className="h-16 w-16 text-muted-foreground" />
            </div>

            <div className="flex-1 text-center md:text-left space-y-3">
              <div>
                <h1 className="text-3xl font-bold">{instructor.name}</h1>
                <p className="text-muted-foreground mt-1">{instructor.department || "No department"}</p>
              </div>

              <div className="flex flex-col md:flex-row gap-4 items-center md:items-start">
                {instructor.avg_rating != null ? (
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                    <span className="text-2xl font-bold">{instructor.avg_rating.toFixed(1)}</span>
                    <span className="text-muted-foreground">/ 5.0</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">No rating</span>
                )}
                <div className="text-muted-foreground">
                  {instructor.num_ratings ?? 0} student reviews
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  <BookOpen className="h-3 w-3 mr-1" />
                  {courses.length} Courses
                </Badge>
                {instructor.external_source === "rmp" && (
                  <Badge variant="outline">
                    RateMyProfessors
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rating Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Rating Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-3xl font-bold text-primary">
                {instructor.avg_rating?.toFixed(1) || "N/A"}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Overall Rating</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-3xl font-bold text-primary">
                {instructor.num_ratings ?? 0}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Total Reviews</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-3xl font-bold text-primary">
                {instructor.avg_difficulty?.toFixed(1) || "N/A"}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Avg Difficulty</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {instructor.external_url && (
              <div>
                <div className="text-sm text-muted-foreground">External Profile</div>
                <a 
                  href={instructor.external_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View on RateMyProfessors
                </a>
              </div>
            )}
            {instructor.last_scraped && (
              <div>
                <div className="text-sm text-muted-foreground">Last Updated</div>
                <div>{new Date(instructor.last_scraped).toLocaleDateString()}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Courses Taught */}
      <Card>
        <CardHeader>
          <CardTitle>Courses Taught</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {courses.map((course) => (
              <Link key={course.id} to={`/courses/${course.subject}/${course.course_number}`}>
                <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{course.subject} {course.course_number}</h3>
                      <Badge variant="secondary">{course.term}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{course.course_name}</p>
                  </div>
                  <Button variant="outline" size="sm">View Course</Button>
                </div>
              </Link>
            ))}

            {courses.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No course information available.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
