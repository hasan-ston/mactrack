// Small API client utilities
const API_BASE: string = (import.meta as any).env?.VITE_API_URL || "";

function resolve(input: RequestInfo): RequestInfo {
  if (typeof input === "string" && input.startsWith("/api/")) {
    const base = API_BASE.replace(/\/$/, "");
    return base ? base + input : input;
  }
  return input;
}

export function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  // When routing through ngrok, bypass the browser interstitial warning page.
  const extraHeaders: Record<string, string> = API_BASE
    ? { "ngrok-skip-browser-warning": "true" }
    : {};

  return fetch(resolve(input), {
    ...init,
    headers: {
      ...extraHeaders,
      ...init?.headers,
    },
  });
}

export default { apiFetch };
