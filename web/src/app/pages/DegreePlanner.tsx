import { useState } from "react";
import { Link } from "react-router";
import { Plus, Trash2, GraduationCap, Calendar } from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { mockUser, courses, getCourseById } from "../data/mockData";
import { RatingDisplay } from "../components/RatingDisplay";

interface PlannedCourse {
  courseId: string;
  term: string;
  year: number;
}

const TERMS = ["Fall", "Winter", "Spring/Summer"];
const CURRENT_YEAR = 2026;
const YEARS = [2026, 2027, 2028, 2029, 2030];

export function DegreePlanner() {
  const [plannedCourses, setPlannedCourses] = useState<PlannedCourse[]>(mockUser.plannedCourses);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [selectedTerm, setSelectedTerm] = useState<string>("Fall");
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);
  const [dialogOpen, setDialogOpen] = useState(false);

  const completedCourseIds = mockUser.completedCourses;
  const availableCourses = courses.filter(course => 
    !completedCourseIds.includes(course.id) &&
    !plannedCourses.some(pc => pc.courseId === course.id)
  );

  const filteredCourses = availableCourses.filter(course => {
    if (!searchQuery) return true;
    return course.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
           course.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleAddCourse = () => {
    if (!selectedCourse) return;
    
    setPlannedCourses([...plannedCourses, {
      courseId: selectedCourse,
      term: selectedTerm,
      year: selectedYear
    }]);
    
    setSelectedCourse("");
    setSearchQuery("");
    setDialogOpen(false);
  };

  const handleRemoveCourse = (courseId: string) => {
    setPlannedCourses(plannedCourses.filter(pc => pc.courseId !== courseId));
  };

  const getCoursesByYearAndTerm = (year: number, term: string) => {
    return plannedCourses
      .filter(pc => pc.year === year && pc.term === term)
      .map(pc => ({ ...pc, course: getCourseById(pc.courseId) }))
      .filter(pc => pc.course);
  };

  const totalPlannedCredits = plannedCourses.reduce((sum, pc) => {
    const course = getCourseById(pc.courseId);
    return course ? sum + course.credits : sum;
  }, 0);

  const totalCompletedCredits = completedCourseIds.reduce((sum, id) => {
    const course = getCourseById(id);
    return course ? sum + course.credits : sum;
  }, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
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
              <div className="space-y-2">
                <Label>Search Courses</Label>
                <Input
                  placeholder="Search by course code or title..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto border rounded-lg">
                {filteredCourses.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No courses found" : "All available courses are already planned"}
                  </p>
                ) : (
                  filteredCourses.map(course => (
                    <button
                      key={course.id}
                      onClick={() => setSelectedCourse(course.id)}
                      className={`w-full text-left p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                        selectedCourse === course.id ? "bg-muted" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{course.code}</div>
                          <div className="text-sm text-muted-foreground">{course.title}</div>
                        </div>
                        <Badge variant="secondary">{course.credits} credits</Badge>
                      </div>
                    </button>
                  ))
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
                  <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
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
                disabled={!selectedCourse}
              >
                Add to Plan
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">{totalCompletedCredits}</div>
                <div className="text-xs text-muted-foreground">Credits Completed</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold">{totalPlannedCredits}</div>
                <div className="text-xs text-muted-foreground">Credits Planned</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-purple-500" />
              <div>
                <div className="text-2xl font-bold">{120 - totalCompletedCredits}</div>
                <div className="text-xs text-muted-foreground">Credits Remaining</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline View */}
      <div className="space-y-8">
        {YEARS.map(year => (
          <Card key={year}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Academic Year {year}-{year + 1}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {TERMS.map(term => {
                  const termCourses = getCoursesByYearAndTerm(year, term);
                  const termCredits = termCourses.reduce((sum, tc) => 
                    tc.course ? sum + tc.course.credits : sum, 0
                  );

                  return (
                    <div key={term} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{term}</h3>
                        <Badge variant="outline">{termCredits} credits</Badge>
                      </div>

                      <div className="space-y-2 min-h-[100px] p-3 border-2 border-dashed rounded-lg bg-muted/20">
                        {termCourses.length === 0 ? (
                          <p className="text-center text-sm text-muted-foreground py-8">
                            No courses planned
                          </p>
                        ) : (
                          termCourses.map(({ courseId, course }) => course && (
                            <div
                              key={courseId}
                              className="p-3 bg-background border rounded-lg space-y-2"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <Link to={`/courses/${course.id}`}>
                                    <div className="font-medium hover:text-primary transition-colors">
                                      {course.code}
                                    </div>
                                  </Link>
                                  <div className="text-xs text-muted-foreground line-clamp-1">
                                    {course.title}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 flex-shrink-0"
                                  onClick={() => handleRemoveCourse(courseId)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>

                              <div className="flex items-center justify-between text-xs">
                                <Badge variant="secondary" className="text-xs">
                                  {course.credits} credits
                                </Badge>
                                <RatingDisplay rating={course.averageRating} size="sm" showNumber={false} />
                              </div>

                              {course.prerequisites && course.prerequisites.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  Prereq: {course.prerequisites.join(", ")}
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

      {/* Help Text */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">Planning Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Aim for 12-15 credits per term for a balanced workload</li>
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
