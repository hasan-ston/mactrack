import { Navigate, Outlet, useLocation } from "react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

/**
 * Wraps routes that require authentication.
 *
 * - While the auth state is being restored from localStorage (isLoading),
 *   shows a brief full-page spinner so there's no flash.
 * - Once resolved, if no user is logged in, redirects to /login and stores
 *   the attempted path in location state so Login/Register can send the user
 *   back after a successful auth.
 * - If logged in, renders the nested routes via <Outlet />.
 */
export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    // Preserve the attempted URL so we can redirect back after login
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <Outlet />;
}
