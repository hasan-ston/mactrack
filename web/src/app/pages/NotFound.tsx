import { Link } from "react-router";
import { Home, Search } from "lucide-react";
import { Button } from "../components/ui/button";

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-300px)] text-center space-y-6">
      <div className="space-y-2">
        <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
        <h2 className="text-3xl font-bold">Page Not Found</h2>
        <p className="text-muted-foreground max-w-md">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>

      <div className="flex gap-4">
        <Button asChild>
          <Link to="/">
            <Home className="h-4 w-4 mr-2" />
            Go Home
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/courses">
            <Search className="h-4 w-4 mr-2" />
            Browse Courses
          </Link>
        </Button>
      </div>
    </div>
  );
}
