import { Outlet, Link, useLocation } from "react-router";
import { BookOpen, Users, LayoutDashboard, Calendar, LogIn, User } from "lucide-react";
import DarkModeToggle from "./DarkModeToggle";
import { Button } from "./ui/button";

export function Layout() {
  const location = useLocation();
  const isAuthPage = location.pathname === "/login" || location.pathname === "/signup";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-[#7A003C] shadow-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-[#7A003C]">M</span>
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg text-white leading-tight">McMaster</span>
              <span className="text-xs text-white/90 leading-tight">Course Explorer</span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center space-x-6">
            <Link 
              to="/courses" 
              className={`text-sm font-medium transition-colors ${
                location.pathname.startsWith('/courses') 
                  ? 'text-[#ffc845]' 
                  : 'text-white hover:text-[#ffc845]'
              }`}
            >
              Browse Courses
            </Link>
            <Link 
              to="/dashboard" 
              className={`text-sm font-medium transition-colors ${
                location.pathname === '/dashboard' 
                  ? 'text-[#ffc845]' 
                  : 'text-white hover:text-[#ffc845]'
              }`}
            >
              Dashboard
            </Link>
            <Link 
              to="/planner" 
              className={`text-sm font-medium transition-colors ${
                location.pathname === '/planner' 
                  ? 'text-[#ffc845]' 
                  : 'text-white hover:text-[#ffc845]'
              }`}
            >
              Degree Planner
            </Link>
          </nav>

          <div className="flex items-center space-x-4">
            {!isAuthPage && (
              <>
                <DarkModeToggle />
                <Button asChild variant="ghost" size="sm" className="text-white hover:text-[#ffc845] hover:bg-white/10">
                  <Link to="/login">
                    <LogIn className="h-4 w-4 mr-2" />
                    Login
                  </Link>
                </Button>
                <Button asChild size="sm" className="bg-[#ffc845] text-[#7A003C] hover:bg-[#ffd96b]">
                  <Link to="/signup">
                    <User className="h-4 w-4 mr-2" />
                    Sign Up
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/50 mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="font-semibold mb-3">About</h3>
              <p className="text-sm text-muted-foreground">
                McMaster Course Explorer helps students make informed decisions about their academic journey.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Features</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Course Browser</li>
                <li>Professor Ratings</li>
                <li>Degree Planner</li>
                <li>Course Reviews</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Resources</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Academic Calendar</li>
                <li>Course Outlines</li>
                <li>Prerequisites Guide</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3">Contact</h3>
              <p className="text-sm text-muted-foreground">
                McMaster University<br />
                Hamilton, ON L8S 4L8<br />
                Canada
              </p>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t text-center text-sm text-muted-foreground">
            © 2026 McMaster Course Explorer. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}