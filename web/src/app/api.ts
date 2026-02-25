// Centralized authenticated fetch utility.
// Reads the access token directly from localStorage so there's no
// initialization ordering issue between App.tsx and the first API call.

const ACCESS_TOKEN_KEY = "mactrack_access";
const REFRESH_TOKEN_KEY = "mactrack_refresh";

// Checks whether the stored access token is expired (with a 30s buffer).
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return Date.now() >= payload.exp * 1000 - 30_000;
  } catch {
    return true; // treat malformed tokens as expired
  }
}

// Attempts to exchange the refresh token for a new access token.
// Returns the new access token, or null if refresh fails.
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return null;

  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      // Refresh token expired or invalid — clear storage so user is prompted to log in
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem("mactrack_user");
      return null;
    }

    const data = await res.json();
    // Save the new access token
    localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
    return data.access_token;
  } catch {
    return null;
  }
}

// authFetch is a drop-in replacement for fetch() on protected routes.
// It automatically:
// 1. Reads the access token from localStorage
// 2. Refreshes it if expired
// 3. Attaches the Authorization header
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token = localStorage.getItem(ACCESS_TOKEN_KEY);

  if (!token) {
    throw new Error("Not authenticated");
  }

  // If the token is expired, try to refresh it before making the request
  if (isTokenExpired(token)) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) throw new Error("Session expired — please log in again");
    token = refreshed;
  }

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      Authorization: `Bearer ${token}`, // always set last so it can't be overridden
    },
  });
}