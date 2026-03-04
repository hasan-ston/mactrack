import { Link } from "react-router";
import { Star, TrendingUp, Users, Clock } from "lucide-react";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Badge } from "./ui/badge";
import { subjectColors, type Course } from "../data/mockData";

interface CourseCardProps {
  course: Course;
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`h-3 w-3 ${star <= Math.round(rating) ? "fill-[#ffc845] text-[#ffc845]" : "fill-muted text-muted"}`}
          viewBox="0 0 24 24"
        >
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      ))}
    </div>
  );
}

function DifficultyBar({ difficulty }: { difficulty: number }) {
  const colors = ["bg-green-400", "bg-green-400", "bg-yellow-400", "bg-orange-400", "bg-red-400"];
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((d) => (
        <div
          key={d}
          className={`h-1.5 w-4 rounded-full transition-all ${
            d <= difficulty ? colors[difficulty - 1] : "bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

export function CourseCard({ course }: CourseCardProps) {
  const subjectColor = subjectColors[course.subject] ?? {
    bg: "bg-gray-100",
    text: "text-gray-700",
    darkBg: "dark:bg-gray-900 dark:text-gray-300",
  };

  return (
    <Link to={`/courses/${course.id}`} className="group block h-full">
      <Card className="h-full flex flex-col transition-all duration-200 group-hover:shadow-lg group-hover:border-primary/40 group-hover:-translate-y-0.5">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border border-transparent
                    ${subjectColor.bg} ${subjectColor.text} ${subjectColor.darkBg}`}
                >
                  {course.subject}
                </span>
                <Badge variant="outline" className="text-xs">
                  {course.term}
                </Badge>
              </div>
              <h4 className="font-semibold text-primary group-hover:underline underline-offset-2 truncate">
                {course.code}
              </h4>
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{course.title}</p>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-lg font-bold text-foreground">{course.credits}</span>
              <span className="text-xs text-muted-foreground block">units</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-3 flex-1">
          <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{course.description}</p>

          {/* Rating row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RatingStars rating={course.averageRating} />
              <span className="text-sm font-semibold text-foreground">{course.averageRating.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">({course.reviewCount})</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>{course.professors.length} prof{course.professors.length !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {/* Difficulty + class avg */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Difficulty</span>
              <DifficultyBar difficulty={course.difficulty} />
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>Avg: <span className="font-medium text-foreground">{course.classAverage}%</span></span>
            </div>
          </div>

          {course.prerequisites.length > 0 && (
            <div className="flex items-start gap-1.5 pt-1 border-t border-border">
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground line-clamp-1">
                <span className="font-medium">Prereqs:</span> {course.prerequisites.join(", ")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
