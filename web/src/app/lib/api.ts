// tokenGetter can be registered by the app so API utilities don't need to
// read localStorage directly (useful for SSR / testing and centralizing logic).
let tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(fn: () => Promise<string | null>) {
  tokenGetter = fn;
}

async function getAccessTokenFromStorageOrGetter(): Promise<string | null> {
  if (tokenGetter) {
    try {
      const t = await tokenGetter();
      if (t) return t;
    } catch {
      // fallthrough to localStorage
    }
  }
  return localStorage.getItem("mactrack_access");
}

export async function authFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const makeRequest = async (token?: string) => {
    const headers = new Headers(init?.headers as HeadersInit || {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!headers.get("Content-Type") && !(init && init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(input, { ...(init || {}), headers });
  };

  const access = await getAccessTokenFromStorageOrGetter();
  if (access) {
    const resp = await makeRequest(access);
    if (resp.status !== 401) return resp;
  }

  const refresh = localStorage.getItem("mactrack_refresh");
  if (!refresh) return makeRequest();

  try {
    const r = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!r.ok) {
      localStorage.removeItem("mactrack_access");
      localStorage.removeItem("mactrack_refresh");
      localStorage.removeItem("mactrack_user");
      return makeRequest();
    }
    const data = await r.json();
    if (data.access_token) {
      localStorage.setItem("mactrack_access", data.access_token);
      return makeRequest(data.access_token);
    }
    return makeRequest();
  } catch (err) {
    localStorage.removeItem("mactrack_access");
    localStorage.removeItem("mactrack_refresh");
    localStorage.removeItem("mactrack_user");
    return makeRequest();
  }
}
