import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { UserPlus, Mail, Lock, User, GraduationCap, Search, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card";
import { useAuth } from "../contexts/AuthContext";

// Shape returned by GET /api/programs
interface APIProgram {
  program_id: number;
  name: string;
  degree_type: string;
}

// ---------------------------------------------------------------------------
// Searchable program picker
// Replaces the static PROGRAMS array with a live-filtered list from the API.
// Uses a custom dropdown instead of shadcn Select because Select doesn't
// support filtering 418 items interactively.
// ---------------------------------------------------------------------------
function ProgramPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string) => void;
}) {
  const [programs, setPrograms] = useState<APIProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch all programs once on mount — public endpoint, no auth needed
  useEffect(() => {
    fetch("/api/programs")
      .then(res => res.json())
      .then((data: APIProgram[]) => {
        // Sort alphabetically by name for easier scanning
        setPrograms((data ?? []).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => setPrograms([]))
      .finally(() => setLoading(false));
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter programs by search query using multi-token AND matching:
  // split the query on whitespace and require every token to appear
  // somewhere in the program name — so "engineer i" finds all Engineering
  // programs even though the string "engineer i" never appears verbatim.
  const filtered = query.trim() === ""
    ? programs
    : (() => {
        const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
        return programs.filter(p => {
          const name = p.name.toLowerCase();
          return tokens.every(token => name.includes(token));
        });
      })();

  const handleSelect = (name: string) => {
    onChange(name);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button — shows selected program or placeholder */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 border rounded-md bg-background text-sm hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <GraduationCap className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className={value ? "text-foreground truncate" : "text-muted-foreground"}>
            {value || "Select your program"}
          </span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-2" />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg">
          {/* Search input inside the dropdown */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                placeholder="Search programs..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full pl-7 pr-3 py-1.5 text-sm bg-muted/50 rounded border-0 outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Scrollable results list */}
          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No programs found
              </p>
            ) : (
              filtered.map(p => (
                <button
                  key={p.program_id}
                  type="button"
                  onClick={() => handleSelect(p.name)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${
                    value === p.name ? "bg-primary/10 text-primary font-medium" : ""
                  }`}
                >
                  <div className="truncate">{p.name}</div>
                  {p.degree_type && (
                    <div className="text-xs text-muted-foreground truncate">{p.degree_type}</div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Register page
// ---------------------------------------------------------------------------

export function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Per-field validation errors (shown on blur or submit)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Compute a 0-4 password strength score for the live indicator bar.
  function passwordStrength(pwd: string): { score: number; label: string; color: string } {
    if (!pwd) return { score: 0, label: "", color: "" };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    // Clamp to 4 max for the bar
    score = Math.min(score, 4);
    const labels = ["", "Weak", "Fair", "Good", "Strong"];
    const colors = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-green-500"];
    return { score, label: labels[score], color: colors[score] };
  }

  const strength = passwordStrength(password);

  function validateField(field: string, value: string): string {
    switch (field) {
      case "name":
        if (!value.trim()) return "Full name is required";
        if (value.trim().length < 2) return "Name must be at least 2 characters";
        return "";
      case "email":
        if (!value.trim()) return "Email is required";
        if (!EMAIL_RE.test(value.trim())) return "Enter a valid email address";
        return "";
      case "password":
        if (!value) return "Password is required";
        if (value.length < 8) return "Password must be at least 8 characters";
        return "";
      case "confirmPassword":
        if (!value) return "Please confirm your password";
        if (value !== password) return "Passwords do not match";
        return "";
      case "year":
        if (!value) return "Please select a year of study";
        return "";
      default:
        return "";
    }
  }

  function handleBlur(field: string, value: string) {
    setTouched(prev => ({ ...prev, [field]: true }));
    setFieldErrors(prev => ({ ...prev, [field]: validateField(field, value) }));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate all fields at once; mark them all touched so errors show
    const fields = { name, email, password, confirmPassword, year };
    const errors: Record<string, string> = {};
    for (const [field, value] of Object.entries(fields)) {
      const msg = validateField(field, value);
      if (msg) errors[field] = msg;
    }
    setFieldErrors(errors);
    setTouched({ name: true, email: true, password: true, confirmPassword: true, year: true });
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await register(email, password, name, program || null, year ? Number(year) : null);
      navigate("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)] py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Create an Account</CardTitle>
          <CardDescription className="text-center">
            Join MacTrack to start planning your degree
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">

            {/* Server/validation error */}
            {error && (
              <p className="text-sm text-red-500 bg-red-50 p-3 rounded">{error}</p>
            )}

            {/* Full name */}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  className={`pl-10 ${touched.name && fieldErrors.name ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  value={name}
                  onChange={e => { setName(e.target.value); if (touched.name) setFieldErrors(p => ({ ...p, name: validateField("name", e.target.value) })); }}
                  onBlur={e => handleBlur("name", e.target.value)}
                />
              </div>
              {touched.name && fieldErrors.name && (
                <p className="text-xs text-red-500">{fieldErrors.name}</p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="student@mcmaster.ca"
                  className={`pl-10 ${touched.email && fieldErrors.email ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (touched.email) setFieldErrors(p => ({ ...p, email: validateField("email", e.target.value) })); }}
                  onBlur={e => handleBlur("email", e.target.value)}
                />
              </div>
              {touched.email && fieldErrors.email && (
                <p className="text-xs text-red-500">{fieldErrors.email}</p>
              )}
            </div>

            {/* Program — searchable picker backed by real API data */}
            <div className="space-y-2">
              <Label>Program</Label>
              <ProgramPicker value={program} onChange={setProgram} />
            </div>

            {/* Year of study */}
            <div className="space-y-2">
              <Label htmlFor="year">Year of Study</Label>
              <Select
                value={year}
                onValueChange={(v) => {
                  setYear(v);
                  setTouched(prev => ({ ...prev, year: true }));
                  setFieldErrors(prev => ({ ...prev, year: validateField("year", v) }));
                }}
              >
                <SelectTrigger className={touched.year && fieldErrors.year ? "border-red-500 focus:ring-red-500" : ""}>
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1st Year</SelectItem>
                  <SelectItem value="2">2nd Year</SelectItem>
                  <SelectItem value="3">3rd Year</SelectItem>
                  <SelectItem value="4">4th Year</SelectItem>
                  <SelectItem value="5">5th Year+</SelectItem>
                </SelectContent>
              </Select>
              {touched.year && fieldErrors.year && (
                <p className="text-xs text-red-500">{fieldErrors.year}</p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Create a password"
                  className={`pl-10 ${touched.password && fieldErrors.password ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  value={password}
                  onChange={e => {
                    const newPwd = e.target.value;
                    setPassword(newPwd);
                    if (touched.password) {
                      setFieldErrors(p => ({ ...p, password: validateField("password", newPwd) }));
                    }
                    // Re-validate confirm using validateField so the empty case
                    // shows "Please confirm your password" not "Passwords do not match".
                    // We compare against newPwd directly because the password state
                    // hasn't updated yet (React setState is async).
                    if (touched.confirmPassword) {
                      setFieldErrors(p => ({
                        ...p,
                        confirmPassword: !confirmPassword
                          ? "Please confirm your password"
                          : confirmPassword !== newPwd
                            ? "Passwords do not match"
                            : "",
                      }));
                    }
                  }}
                  onBlur={e => handleBlur("password", e.target.value)}
                />
              </div>
              {touched.password && fieldErrors.password
                ? <p className="text-xs text-red-500">{fieldErrors.password}</p>
                : <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
              }
              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map(level => (
                      <div
                        key={level}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          level <= strength.score ? strength.color : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{strength.label}</p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  className={`pl-10 ${touched.confirmPassword && fieldErrors.confirmPassword ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); if (touched.confirmPassword) setFieldErrors(p => ({ ...p, confirmPassword: validateField("confirmPassword", e.target.value) })); }}
                  onBlur={e => handleBlur("confirmPassword", e.target.value)}
                />
              </div>
              {touched.confirmPassword && fieldErrors.confirmPassword && (
                <p className="text-xs text-red-500">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {/* Terms checkbox */}
            <div className="flex items-start space-x-2">
              <input
                type="checkbox"
                id="terms"
                className="h-4 w-4 rounded border-gray-300 mt-1"
                required
              />
              <label htmlFor="terms" className="text-sm text-muted-foreground">
                I agree to the Terms of Service and Privacy Policy
              </label>
            </div>

          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              <UserPlus className="h-4 w-4 mr-2" />
              {loading ? "Creating account..." : "Create Account"}
            </Button>

            <div className="text-sm text-center text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}