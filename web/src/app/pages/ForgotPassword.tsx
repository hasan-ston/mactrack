import { useState } from "react";
import { Link } from "react-router";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [fieldError, setFieldError] = useState("");
  const [touched, setTouched] = useState(false);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateEmail(value: string): string {
    if (!value.trim()) return "Email is required";
    if (!EMAIL_RE.test(value.trim())) return "Enter a valid email address";
    return "";
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const msg = validateEmail(email);
    setFieldError(msg);
    setTouched(true);
    if (msg) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-2">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-2xl font-bold">Check Your Email</CardTitle>
            <CardDescription>
              If <span className="font-medium text-foreground">{email}</span> is
              registered, you'll receive a password reset link within a few
              minutes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground text-center">
            <p>The link expires in <strong className="text-foreground">1 hour</strong>.</p>
            <p>
              Didn't receive anything? Check your spam folder, or{" "}
              <button
                className="text-primary hover:underline"
                onClick={() => { setSubmitted(false); setEmail(""); setTouched(false); setFieldError(""); }}
              >
                try again
              </button>
              .
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Sign In
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Forgot Password
          </CardTitle>
          <CardDescription className="text-center">
            Enter your email address and we'll send you a link to reset your
            password.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 p-3 rounded">
                {error}
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="student@mcmaster.ca"
                  className={`pl-10 ${
                    touched && fieldError
                      ? "border-red-500 focus-visible:ring-red-500"
                      : ""
                  }`}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (touched)
                      setFieldError(validateEmail(e.target.value));
                  }}
                  onBlur={(e) => {
                    setTouched(true);
                    setFieldError(validateEmail(e.target.value));
                  }}
                />
              </div>
              {touched && fieldError && (
                <p className="text-xs text-red-500">{fieldError}</p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending…" : "Send Reset Link"}
            </Button>

            <Button asChild variant="ghost" className="w-full">
              <Link to="/login">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Sign In
              </Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
