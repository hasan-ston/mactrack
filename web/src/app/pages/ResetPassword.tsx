import { useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router";
import { Lock, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "../components/ui/button";
import { apiFetch } from "../lib/apiClient";
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

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function validateField(field: string, value: string, other?: string): string {
    if (field === "password") {
      if (!value) return "Password is required";
      if (value.length < 8) return "Password must be at least 8 characters";
    }
    if (field === "confirm") {
      if (!value) return "Please confirm your password";
      if (value !== other) return "Passwords do not match";
    }
    return "";
  }

  function handleBlur(field: string, value: string) {
    setTouched((p) => ({ ...p, [field]: true }));
    setFieldErrors((p) => ({
      ...p,
      [field]: validateField(
        field,
        value,
        field === "confirm" ? password : confirm
      ),
    }));
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const errs: Record<string, string> = {
      password: validateField("password", password),
      confirm: validateField("confirm", confirm, password),
    };
    setFieldErrors(errs);
    setTouched({ password: true, confirm: true });
    if (Object.values(errs).some(Boolean)) return;

    if (!token) {
      setError("Missing reset token. Please use the link from your email.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(
          text.trim() ||
            "Could not reset your password. The link may have expired."
        );
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── No token in URL ──────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-1">
            <div className="flex justify-center mb-2">
              <XCircle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-bold">Invalid Link</CardTitle>
            <CardDescription>
              This password reset link is missing a token. Please use the link
              from your email, or request a new one.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link to="/forgot-password">Request New Link</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/login">Back to Sign In</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ── Success state ────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-1">
            <div className="flex justify-center mb-2">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
            </div>
            <CardTitle className="text-2xl font-bold">Password Updated</CardTitle>
            <CardDescription>
              Your password has been changed successfully. You can now sign in
              with your new password.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button className="w-full" onClick={() => navigate("/login")}>
              Sign In
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ── Reset form ───────────────────────────────────────────────────────────
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)] px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            Set New Password
          </CardTitle>
          <CardDescription className="text-center">
            Choose a strong password of at least 8 characters.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 p-3 rounded">
                {error}
              </p>
            )}

            {/* New password */}
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  className={`pl-10 pr-10 ${
                    touched.password && fieldErrors.password
                      ? "border-red-500 focus-visible:ring-red-500"
                      : ""
                  }`}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (touched.password)
                      setFieldErrors((p) => ({
                        ...p,
                        password: validateField("password", e.target.value),
                      }));
                  }}
                  onBlur={(e) => handleBlur("password", e.target.value)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {touched.password && fieldErrors.password && (
                <p className="text-xs text-red-500">{fieldErrors.password}</p>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirm"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat your new password"
                  className={`pl-10 pr-10 ${
                    touched.confirm && fieldErrors.confirm
                      ? "border-red-500 focus-visible:ring-red-500"
                      : ""
                  }`}
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    if (touched.confirm)
                      setFieldErrors((p) => ({
                        ...p,
                        confirm: validateField(
                          "confirm",
                          e.target.value,
                          password
                        ),
                      }));
                  }}
                  onBlur={(e) => handleBlur("confirm", e.target.value)}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {touched.confirm && fieldErrors.confirm && (
                <p className="text-xs text-red-500">{fieldErrors.confirm}</p>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Updating…" : "Update Password"}
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link to="/login">Cancel</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
