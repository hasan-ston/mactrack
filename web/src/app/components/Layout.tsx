import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router";
import { useTheme } from "next-themes";
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  LogIn,
  User,
  Users,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  UsersRound,
} from "lucide-react";
import { Button } from "./ui/button";
import { FeedbackWidget } from "./FeedbackWidget";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 w-9 h-9" aria-label="Toggle theme">
        <Monitor className="h-4 w-4" />
      </Button>
    );
  }

  const icons = {
    light: <Sun className="h-4 w-4" />,
    dark: <Moon className="h-4 w-4" />,
    system: <Monitor className="h-4 w-4" />,
  };

  const nextTheme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const label = `Switch to ${nextTheme} mode`;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(nextTheme)}
      className="text-white hover:bg-white/10 hover:text-[#ffc845] transition-colors w-9 h-9"
      aria-label={label}
      title={label}
    >
      {icons[theme as keyof typeof icons] ?? icons.system}
    </Button>
  );
}

const navLinks = [
  { to: "/courses", label: "Browse Courses", icon: BookOpen, match: (p: string) => p.startsWith("/courses") },
  { to: "/professors", label: "Browse Professors", icon: Users, match: (p: string) => p.startsWith("/professors") },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
  { to: "/planner", label: "Degree Planner", icon: GraduationCap, match: (p: string) => p === "/planner" },
];

export function Layout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAuthPage = location.pathname === "/login" || location.pathname === "/signup";

  // Close mobile menu on route change
  useEffect(() => setMobileOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[#5a0028] bg-[#7A003C] shadow-lg">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="h-10 w-10 bg-white rounded-full flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
              <span className="text-xl font-bold text-[#7A003C]">M</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-bold text-lg text-white leading-tight">MacTrack</span>
              <span className="text-xs text-white/70 leading-tight">McMaster Course Explorer</span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center space-x-1">
            {navLinks.map(({ to, label, match }) => (
              <Link
                key={to}
                to={to}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  match(location.pathname)
                    ? "bg-white/15 text-[#ffc845]"
                    : "text-white/90 hover:bg-white/10 hover:text-white"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            <ThemeToggle />

            {!isAuthPage && (
              <>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden md:inline-flex text-white hover:bg-white/10 hover:text-[#ffc845]"
                >
                  <Link to="/login">
                    <LogIn className="h-4 w-4 mr-1.5" />
                    Login
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="hidden md:inline-flex bg-[#ffc845] text-[#7A003C] hover:bg-[#ffd96b] font-semibold"
                >
                  <Link to="/signup">
                    <User className="h-4 w-4 mr-1.5" />
                    Sign Up
                  </Link>
                </Button>
              </>
            )}

            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-white hover:bg-white/10 w-9 h-9 ml-1"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle mobile menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#6a0033] px-4 py-3 space-y-1 animate-in slide-in-from-top-2 duration-200">
            {navLinks.map(({ to, label, icon: Icon, match }) => (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  match(location.pathname)
                    ? "bg-white/15 text-[#ffc845]"
                    : "text-white hover:bg-white/10"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
            <div className="pt-2 border-t border-white/10 flex gap-2">
              <Button asChild variant="ghost" size="sm" className="flex-1 text-white hover:bg-white/10">
                <Link to="/login">
                  <LogIn className="h-4 w-4 mr-1.5" />
                  Login
                </Link>
              </Button>
              <Button asChild size="sm" className="flex-1 bg-[#ffc845] text-[#7A003C] hover:bg-[#ffd96b] font-semibold">
                <Link to="/signup">
                  <User className="h-4 w-4 mr-1.5" />
                  Sign Up
                </Link>
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Page content */}
      <main>
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/40 mt-16">
        <div className="container mx-auto px-4 py-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 bg-[#7A003C] rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-white">M</span>
                </div>
                <span className="font-semibold text-foreground">MacTrack</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Helping McMaster students make informed decisions about their academic journey.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-3 text-foreground">Features</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link to="/courses" className="hover:text-primary transition-colors">Course Browser</Link>
                </li>
                <li>
                  <Link to="/courses" className="hover:text-primary transition-colors">Professor Ratings</Link>
                </li>
                <li>
                  <Link to="/planner" className="hover:text-primary transition-colors">Degree Planner</Link>
                </li>
                <li>
                  <Link to="/courses" className="hover:text-primary transition-colors">Course Reviews</Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3 text-foreground">Resources</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="hover:text-primary transition-colors cursor-pointer">Academic Calendar</li>
                <li className="hover:text-primary transition-colors cursor-pointer">Course Outlines</li>
                <li className="hover:text-primary transition-colors cursor-pointer">Prerequisites Guide</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-3 text-foreground">Project</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <Link to="/contributors" className="flex items-center hover:text-primary font-medium text-foreground transition-colors">
                    <UsersRound className="w-4 h-4 mr-2" />
                    Contributors
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-6 border-t text-center text-sm text-muted-foreground">
            © 2026 MacTrack — McMaster Course Explorer. All rights reserved.
          </div>
        </div>
      </footer>
      {/* Feedback widget — unobtrusive floating button, bottom-right */}
      <FeedbackWidget />
    </div>
  );
}