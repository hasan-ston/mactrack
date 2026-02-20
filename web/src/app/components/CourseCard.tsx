import { Link } from "react-router";
import { Star, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import type { Course } from "../data/mockData";

interface CourseCardProps {
  course: Course;
}

export function CourseCard({ course }: CourseCardProps) {
  return (
    <Link to={`/courses/${course.id}`}>
      <Card className="h-full hover:shadow-lg hover:border-primary/50 transition-all cursor-pointer">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg text-primary">{course.code}</CardTitle>
              <CardDescription className="mt-1">{course.title}</CardDescription>
            </div>
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">{course.credits} credits</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
            {course.description}
          </p>
          
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <Star className="h-4 w-4 fill-[#ffc845] text-[#ffc845] mr-1" />
                <span className="font-medium">{course.averageRating.toFixed(1)}</span>
                <span className="text-muted-foreground ml-1">({course.reviewCount})</span>
              </div>
              
              <div className="flex items-center text-muted-foreground">
                <TrendingUp className="h-4 w-4 mr-1" />
                <span>Avg: {course.classAverage}%</span>
              </div>
            </div>
            
            <Badge variant="outline">
              {course.term}
            </Badge>
          </div>
          
          {course.prerequisites && course.prerequisites.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">
                Prerequisites: {course.prerequisites.join(", ")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}