import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// Shape of the data we store after a successful login
interface AuthUser {
  userID: number;
  email: string;
  displayName: string;
  program?: string | null;
  yearOfStudy?: number | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;            // True while we're checking localStorage on mount
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
    program?: string | null,
    yearOfStudy?: number | null
  ) => Promise<void>;
  logout: () => void;
  getAccessToken: () => Promise<string | null>; // Handles refresh automatically
}

const AuthContext = createContext<AuthContextType | null>(null);

// Token storage keys in localStorage
const ACCESS_TOKEN_KEY = "mactrack_access";
const REFRESH_TOKEN_KEY = "mactrack_refresh";
const USER_KEY = "mactrack_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, restore auth state from localStorage so the user stays logged in
  // across page refreshes
  useEffect(() => {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) {
      setUser(JSON.parse(stored));
    }
    setIsLoading(false);
  }, []);

  // Persist user info + tokens to localStorage
  const saveAuth = (tokens: { access_token: string; refresh_token: string }, userData: AuthUser) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    // Persist the full user object including optional program and yearOfStudy
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setUser(userData);
  };

  // Clear everything on logout
  const logout = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  };

  // getAccessToken returns a valid access token, refreshing it if needed.
  // This is called by the API utility before every protected request.
  const getAccessToken = async (): Promise<string | null> => {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!accessToken) return null;

    // Decode the JWT payload (middle segment) to check expiry.
    // We don't verify the signature here — that's the backend's job.
    try {
      const payload = JSON.parse(atob(accessToken.split(".")[1]));
      const expiresAt = payload.exp * 1000; // Convert seconds → ms
      const isExpired = Date.now() >= expiresAt - 30_000; // 30s buffer before actual expiry

      if (!isExpired) {
        return accessToken; // Still valid, use it directly
      }

      // Access token expired — try to refresh it
      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        logout(); // Refresh token missing — force re-login
        return null;
      }

      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        logout(); // Refresh token expired or invalid — force re-login
        return null;
      }

      const data = await res.json();
      // Save the new access token (refresh token stays the same)
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      return data.access_token;
    } catch {
      logout();
      return null;
    }
  };

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Login failed");
    }

    const data = await res.json();
    saveAuth(
      { access_token: data.access_token, refresh_token: data.refresh_token },
      {
        userID: data.user_id,
        email: data.email,
        displayName: data.display_name,
        program: data.program ?? null,
        yearOfStudy: data.year_of_study ?? null,
      }
    );
  };

  const register = async (
    email: string,
    password: string,
    displayName: string,
    program?: string | null,
    yearOfStudy?: number | null
  ) => {
    const body: any = { email, password, display_name: displayName };
    if (typeof program !== "undefined") body.program = program;
    if (typeof yearOfStudy !== "undefined") body.year_of_study = yearOfStudy;

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Registration failed");
    }

    const data = await res.json();
    saveAuth(
      { access_token: data.access_token, refresh_token: data.refresh_token },
      {
        userID: data.user_id,
        email: data.email,
        displayName: data.display_name,
        program: data.program ?? null,
        yearOfStudy: data.year_of_study ?? null,
      }
    );
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, getAccessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

// useAuth is the hook all components use to access auth state
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}