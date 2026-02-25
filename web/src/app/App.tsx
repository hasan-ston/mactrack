import { RouterProvider } from "react-router";
import { router } from "./routes";
import { AuthProvider } from "./contexts/AuthContext";

// AuthProvider wraps the entire app so any page can call useAuth()
// to get the logged-in user or auth actions (login, logout, register).
// authFetch (used by protected pages) reads the token directly from
// localStorage, so no initialization step is needed here.
export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}