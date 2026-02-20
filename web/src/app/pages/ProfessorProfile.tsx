import { useParams, Link } from "react-router";
import { ArrowLeft, Users, Mail, Star, BookOpen } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { RatingDisplay } from "../components/RatingDisplay";
import { getProfessorById, getCourseById, getReviewsByProfessorId } from "../data/mockData";

export function ProfessorProfile() {
  const { professorId } = useParams();
  const professor = getProfessorById(professorId || "");

  if (!professor) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Professor Not Found</h2>
        <p className="text-muted-foreground mb-4">
          The professor profile you're looking for doesn't exist.
        </p>
        <Button asChild>
          <Link to="/courses">Browse Courses</Link>
        </Button>
      </div>
    );
  }

  const courses = professor.courses.map(id => getCourseById(id)).filter(Boolean);
  const reviews = getReviewsByProfessorId(professor.id);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back Button */}
      <Button asChild variant="ghost" size="sm">
        <Link to="/courses">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Courses
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
                <h1 className="text-3xl font-bold">{professor.name}</h1>
                <p className="text-muted-foreground mt-1">{professor.faculty}</p>
              </div>

              <div className="flex flex-col md:flex-row gap-4 items-center md:items-start">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                  <span className="text-2xl font-bold">{professor.rating.toFixed(1)}</span>
                  <span className="text-muted-foreground">/ 5.0</span>
                </div>
                <div className="text-muted-foreground">
                  {professor.reviewCount} student reviews
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  <BookOpen className="h-3 w-3 mr-1" />
                  {courses.length} Courses
                </Badge>
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
              <div className="text-3xl font-bold text-primary">{professor.rating.toFixed(1)}</div>
              <div className="text-sm text-muted-foreground mt-1">Overall Rating</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-3xl font-bold text-primary">{professor.reviewCount}</div>
              <div className="text-sm text-muted-foreground mt-1">Total Reviews</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-3xl font-bold text-primary">{courses.length}</div>
              <div className="text-sm text-muted-foreground mt-1">Courses Taught</div>
            </div>
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
            {courses.map(course => course && (
              <Link key={course.id} to={`/courses/${course.id}`}>
                <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{course.code}</h3>
                      <Badge variant="secondary">{course.credits} credits</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{course.title}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <RatingDisplay rating={course.averageRating} size="sm" />
                    <Button variant="outline" size="sm">View Course</Button>
                  </div>
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

      {/* Student Reviews */}
      <Card>
        <CardHeader>
          <CardTitle>Student Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {reviews.map(review => (
              <div key={review.id} className="border-b last:border-b-0 pb-4 last:pb-0">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium">{review.userName}</div>
                    <div className="text-sm text-muted-foreground">{review.date}</div>
                  </div>
                  <RatingDisplay rating={review.rating} size="sm" />
                </div>
                <p className="text-muted-foreground">{review.comment}</p>
              </div>
            ))}

            {reviews.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No reviews available yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
