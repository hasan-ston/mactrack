import { useState } from "react";
import { useParams, Link } from "react-router";
import { ArrowLeft, BookOpen, Users, Star, TrendingUp, Clock, ThumbsUp } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Separator } from "../components/ui/separator";
import { Progress } from "../components/ui/progress";
import { RatingDisplay } from "../components/RatingDisplay";
import { getCourseById, getProfessorById, getReviewsByCourseId, courses } from "../data/mockData";

export function CourseDetail() {
  const { courseId } = useParams();
  const course = getCourseById(courseId || "");
  const [isAdded, setIsAdded] = useState(false);

  if (!course) {
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

  const reviews = getReviewsByCourseId(course.id);
  const professors = course.professors.map(id => getProfessorById(id)).filter(Boolean);
  const prerequisiteCourses = course.prerequisites?.map(code => 
    courses.find(c => c.code === code)
  ).filter(Boolean);

  const ratingDistribution = [
    { stars: 5, count: 45, percentage: 45 },
    { stars: 4, count: 30, percentage: 30 },
    { stars: 3, count: 15, percentage: 15 },
    { stars: 2, count: 7, percentage: 7 },
    { stars: 1, count: 3, percentage: 3 },
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
              <h1 className="text-4xl font-bold">{course.code}</h1>
              <Badge variant="secondary">{course.credits} Credits</Badge>
            </div>
            <h2 className="text-2xl text-muted-foreground">{course.title}</h2>
            <p className="text-sm text-muted-foreground">{course.faculty}</p>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={() => setIsAdded(!isAdded)}
              variant={isAdded ? "secondary" : "default"}
            >
              {isAdded ? "Added to Planner" : "Add to Planner"}
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-[#ffc845]" />
                <div>
                  <div className="text-2xl font-bold text-primary">{course.averageRating.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground">{course.reviewCount} reviews</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-2xl font-bold text-primary">{course.classAverage}%</div>
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
                  <div className="text-2xl font-bold text-primary">{course.difficulty.toFixed(1)}/5</div>
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
                  <div className="text-xl font-bold text-primary">{course.term.split(",")[0]}</div>
                  <div className="text-xs text-muted-foreground">Next Offered</div>
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
          <TabsTrigger value="reviews">Reviews ({course.reviewCount})</TabsTrigger>
          <TabsTrigger value="professors">Professors ({professors.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>Course Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">{course.description}</p>
            </CardContent>
          </Card>

          {/* Prerequisites */}
          {prerequisiteCourses && prerequisiteCourses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Prerequisites</CardTitle>
                <CardDescription>Required courses before taking this course</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {prerequisiteCourses.map(prereq => prereq && (
                    <Link key={prereq.id} to={`/courses/${prereq.id}`}>
                      <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div>
                          <div className="font-medium">{prereq.code}</div>
                          <div className="text-sm text-muted-foreground">{prereq.title}</div>
                        </div>
                        <RatingDisplay rating={prereq.averageRating} size="sm" />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Course Details */}
          <Card>
            <CardHeader>
              <CardTitle>Course Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Terms Offered:</span>
                <span className="font-medium">{course.term}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credit Hours:</span>
                <span className="font-medium">{course.credits}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Faculty:</span>
                <span className="font-medium">{course.faculty}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reviews" className="space-y-6">
          {/* Rating Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Rating Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-8">
                <div className="text-center space-y-2">
                  <div className="text-5xl font-bold">{course.averageRating.toFixed(1)}</div>
                  <RatingDisplay rating={course.averageRating} size="lg" showNumber={false} />
                  <p className="text-sm text-muted-foreground">
                    Based on {course.reviewCount} reviews
                  </p>
                </div>

                <div className="space-y-2">
                  {ratingDistribution.map(({ stars, count, percentage }) => (
                    <div key={stars} className="flex items-center gap-3">
                      <span className="text-sm font-medium w-12">{stars} stars</span>
                      <Progress value={percentage} className="flex-1" />
                      <span className="text-sm text-muted-foreground w-12 text-right">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Reviews List */}
          <div className="space-y-4">
            {reviews.map(review => (
              <Card key={review.id}>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{review.userName}</div>
                        <div className="text-sm text-muted-foreground">{review.date}</div>
                      </div>
                      <RatingDisplay rating={review.rating} size="sm" />
                    </div>

                    <p className="text-muted-foreground">{review.comment}</p>

                    <div className="flex items-center gap-4 text-sm">
                      <Badge variant="outline">
                        Difficulty: {review.difficulty}/5
                      </Badge>
                      <Button variant="ghost" size="sm">
                        <ThumbsUp className="h-4 w-4 mr-1" />
                        Helpful ({review.helpful})
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {reviews.length === 0 && (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No reviews yet. Be the first to review this course!
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="professors" className="space-y-4">
          {professors.map(professor => professor && (
            <Link key={professor.id} to={`/professors/${professor.id}`}>
              <Card className="hover:shadow-lg transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                        <Users className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{professor.name}</h3>
                        <p className="text-sm text-muted-foreground">{professor.faculty}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <RatingDisplay rating={professor.rating} size="sm" />
                          <span className="text-sm text-muted-foreground">
                            ({professor.reviewCount} reviews)
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button variant="outline">View Profile</Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {professors.length === 0 && (
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