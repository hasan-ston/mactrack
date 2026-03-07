/**
 * MacTrack API Cache Worker
 *
 * Edge caching proxy that sits in front of the Go API server on EC2.
 * Caches read-only public endpoints at the Cloudflare edge for 1 hour,
 * reducing EC2 load and improving global response times.
 *
 * Cached routes (GET only):
 *   /api/courses*
 *   /api/programs*
 *   /api/instructors*
 *
 * All other routes (/api/auth/*, /api/users/*) are proxied transparently —
 * never cached because they are authenticated or write operations.
 *
 * Environment variables (set via `wrangler secret put` or Pages UI):
 *   ORIGIN_URL      — Go API origin, e.g. https://api.mactrack.com
 *   ALLOWED_ORIGIN  — Frontend origin for CORS, e.g. https://mactrack.pages.dev
 */

export interface Env {
  /** The EC2 Go API base URL — no trailing slash. */
  ORIGIN_URL: string;
  /** The Cloudflare Pages frontend origin for CORS response headers. */
  ALLOWED_ORIGIN: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** URL path prefixes whose GET responses are safe to cache at the edge. */
const CACHEABLE_PREFIXES = [
  "/api/courses",
  "/api/programs",
  "/api/instructors",
] as const;

/** How long Cloudflare's CDN caches a response (seconds). */
const CDN_TTL = 3600; // 1 hour

/** How long browsers are allowed to cache (0 = rely on CDN / revalidate). */
const BROWSER_MAX_AGE = 0;

/** Stale-while-revalidate window (seconds). */
const SWR = 60;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCacheableRequest(request: Request): boolean {
  if (request.method !== "GET") return false;
  const { pathname } = new URL(request.url);
  return CACHEABLE_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Clone a response and attach CORS + cache headers without consuming the body.
 * We only set Access-Control-Allow-Origin — the client's browser handles the
 * preflight itself for credentialed requests.
 */
function withCorsHeaders(
  response: Response,
  allowedOrigin: string,
  cacheStatus: "HIT" | "MISS" | "BYPASS"
): Response {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", allowedOrigin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("X-Cache", cacheStatus);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN ?? "*";

    // ── CORS preflight ───────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      });
    }

    // Build the request we'll send to the Go API origin
    const originUrl = new URL(url.pathname + url.search, env.ORIGIN_URL);
    const forwardRequest = new Request(originUrl.toString(), {
      method: request.method,
      headers: request.headers,
      // Only include a body for non-GET/HEAD requests
      body: ["GET", "HEAD"].includes(request.method) ? null : request.body,
      redirect: "follow",
    });

    // ── Non-cacheable routes (auth, user plan, etc.) ─────────────────────────
    if (!isCacheableRequest(request)) {
      const proxied = await fetch(forwardRequest);
      return withCorsHeaders(proxied, origin, "BYPASS");
    }

    // ── Cacheable GET routes ─────────────────────────────────────────────────
    //
    // Cache key: the full origin URL (pathname + query string).
    // We strip client-specific headers (Cookies, Authorization) so every user
    // shares the same cached response for these public endpoints.
    const cache = caches.default;
    const cacheKey = new Request(originUrl.toString(), { method: "GET" });

    const cached = await cache.match(cacheKey);
    if (cached) {
      return withCorsHeaders(cached, origin, "HIT");
    }

    // Cache miss → fetch from origin
    const originResponse = await fetch(forwardRequest);

    if (originResponse.ok) {
      // Build a cacheable clone with explicit cache-control headers.
      // We set s-maxage (CDN TTL) but keep browser max-age=0 so the edge
      // always controls freshness and clients don't cache stale data locally.
      const responseToCache = new Response(originResponse.clone().body, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers: new Headers(originResponse.headers),
      });
      responseToCache.headers.set(
        "Cache-Control",
        `public, max-age=${BROWSER_MAX_AGE}, s-maxage=${CDN_TTL}, stale-while-revalidate=${SWR}`
      );
      responseToCache.headers.set("Vary", "Accept-Encoding");
      // Store in cache without blocking the response
      ctx.waitUntil(cache.put(cacheKey, responseToCache));
    }

    return withCorsHeaders(originResponse, origin, "MISS");
  },
} satisfies ExportedHandler<Env>;
