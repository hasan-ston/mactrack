import { useState } from "react";
import { Link } from "react-router";
import { Search, BookOpen, GraduationCap, Star, TrendingUp } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { courses } from "../data/mockData";
import { CourseCard } from "../components/CourseCard";

export function Home() {
  const [searchQuery, setSearchQuery] = useState("");

  const featuredCourses = courses.slice(0, 3);
  const popularCourses = courses.slice(3, 6);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/courses?search=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center space-y-6 py-12">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Explore McMaster University Courses
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Make informed decisions about your academic journey with course reviews, 
          ratings, and comprehensive degree planning tools.
        </p>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto mt-8">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search courses (e.g., COMPSCI 1MD3, Data Structures, Algorithms)"
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button type="submit" size="lg">
              Search
            </Button>
          </div>
        </form>
      </section>

      {/* Feature Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="text-center border-2 hover:border-primary transition-all">
          <CardHeader>
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Browse Courses</CardTitle>
            <CardDescription>
              Explore all courses offered at McMaster with detailed descriptions and prerequisites
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full border-primary text-primary hover:bg-primary hover:text-white">
              <Link to="/courses">View All Courses</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="text-center border-2 hover:border-primary transition-all">
          <CardHeader>
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <Star className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Course Reviews</CardTitle>
            <CardDescription>
              Read honest reviews and ratings from students who have taken the courses
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full border-primary text-primary hover:bg-primary hover:text-white">
              <Link to="/courses">Browse Reviews</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="text-center border-2 hover:border-primary transition-all">
          <CardHeader>
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
              <GraduationCap className="h-6 w-6 text-primary" />
            </div>
            <CardTitle>Degree Planner</CardTitle>
            <CardDescription>
              Plan your academic journey with our interactive degree planning tool
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full border-primary text-primary hover:bg-primary hover:text-white">
              <Link to="/planner">Plan Your Degree</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Featured Courses */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Featured Courses</h2>
            <p className="text-muted-foreground mt-1">Popular courses among students</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/courses">View All</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-muted/50 rounded-lg p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-4xl font-bold text-primary mb-2">500+</div>
            <div className="text-muted-foreground">Courses Available</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-primary mb-2">10,000+</div>
            <div className="text-muted-foreground">Student Reviews</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-primary mb-2">200+</div>
            <div className="text-muted-foreground">Professors Rated</div>
          </div>
        </div>
      </section>

      {/* Trending Courses */}
      <section className="space-y-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight">Trending This Term</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {popularCourses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary text-primary-foreground rounded-lg p-12 text-center space-y-4">
        <h2 className="text-3xl font-bold">Ready to Plan Your Academic Journey?</h2>
        <p className="text-lg opacity-90 max-w-2xl mx-auto">
          Join thousands of McMaster students using our platform to make informed course decisions
        </p>
        <div className="flex gap-4 justify-center mt-6">
          <Button asChild size="lg" variant="secondary">
            <Link to="/signup">Get Started</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white/10">
            <Link to="/courses">Browse Courses</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}