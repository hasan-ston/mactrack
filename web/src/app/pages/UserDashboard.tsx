import { Link } from "react-router";
import { User, BookOpen, Calendar, Star, TrendingUp } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Progress } from "../components/ui/progress";
import { mockUser, getCourseById } from "../data/mockData";
import { RatingDisplay } from "../components/RatingDisplay";

export function UserDashboard() {
  const user = mockUser;
  const completedCourses = user.completedCourses.map(id => getCourseById(id)).filter(Boolean);
  const plannedCourses = user.plannedCourses.map(pc => ({
    ...pc,
    course: getCourseById(pc.courseId)
  })).filter(pc => pc.course);

  const totalCreditsCompleted = completedCourses.reduce((sum, course) => 
    course ? sum + course.credits : sum, 0
  );
  const totalCreditsPlanned = plannedCourses.reduce((sum, pc) => 
    pc.course ? sum + pc.course.credits : sum, 0
  );

  const averageGrade = completedCourses.reduce((sum, course) => 
    course ? sum + course.classAverage : sum, 0
  ) / (completedCourses.length || 1);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, {user.name}
          </p>
        </div>
        <Button asChild>
          <Link to="/planner">
            <Calendar className="h-4 w-4 mr-2" />
            View Degree Planner
          </Link>
        </Button>
      </div>

      {/* Profile Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto md:mx-0">
              <User className="h-12 w-12 text-primary" />
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-2xl font-bold">{user.name}</h2>
                <p className="text-muted-foreground">{user.email}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{user.program}</Badge>
                <Badge variant="outline">Year {user.year}</Badge>
                <Badge variant="outline">{totalCreditsCompleted} Credits Completed</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{completedCourses.length}</div>
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
                <div className="text-2xl font-bold">{plannedCourses.length}</div>
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
                <div className="text-2xl font-bold">{totalCreditsCompleted}</div>
                <div className="text-xs text-muted-foreground">Total Credits</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{averageGrade.toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">Average Grade</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      <Card>
        <CardHeader>
          <CardTitle>Degree Progress</CardTitle>
          <CardDescription>Track your progress towards graduation</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Credits Completed</span>
              <span className="font-medium">{totalCreditsCompleted} / 120</span>
            </div>
            <Progress value={(totalCreditsCompleted / 120) * 100} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{totalCreditsCompleted}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{totalCreditsPlanned}</div>
              <div className="text-sm text-muted-foreground">Planned</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">{120 - totalCreditsCompleted}</div>
              <div className="text-sm text-muted-foreground">Remaining</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Completed Courses */}
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
            {completedCourses.map(course => course && (
              <Link key={course.id} to={`/courses/${course.id}`}>
                <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{course.code}</h3>
                      <Badge variant="secondary">{course.credits} credits</Badge>
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                        Completed
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{course.title}</p>
                  </div>
                  <RatingDisplay rating={course.averageRating} size="sm" />
                </div>
              </Link>
            ))}

            {completedCourses.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No completed courses yet. Start planning your academic journey!
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Planned Courses */}
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
            {plannedCourses.map(({ course, term, year, courseId }) => course && (
              <Link key={courseId} to={`/courses/${course.id}`}>
                <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{course.code}</h3>
                      <Badge variant="secondary">{course.credits} credits</Badge>
                      <Badge variant="outline">{term} {year}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{course.title}</p>
                  </div>
                  <RatingDisplay rating={course.averageRating} size="sm" />
                </div>
              </Link>
            ))}

            {plannedCourses.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No courses planned yet. Visit the degree planner to get started!
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
