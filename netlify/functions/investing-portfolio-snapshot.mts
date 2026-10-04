import { createHash, timingSafeEqual } from "node:crypto";
import { normalizeSnapshot } from "./_shared/portfolio-snapshot.mts";

type Runtime = typeof globalThis & { Netlify?: { env: { get(key: string): string | undefined } } };
const env = (key: string) => (globalThis as Runtime).Netlify?.env.get(key);
const digest = (value: string) => createHash("sha256").update(value).digest();
const tokenPattern = /^[A-Za-z0-9_-]{43,128}$/;

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Netlify-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405, { Allow: "GET" });

  // Read each invocation: do not cache revoked credentials in a warm instance.
  const token = env("INVESTING_PORTFOLIO_TOKEN");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !tokenPattern.test(token) || token === serviceKey) {
    return json({ error: "integration_unavailable" }, 503);
  }
  const supplied = /^Bearer ([A-Za-z0-9_-]{43,128})$/i.exec(req.headers.get("authorization") || "")?.[1];
  if (!supplied || !timingSafeEqual(digest(supplied), digest(token))) {
    return json({ error: "unauthorized" }, 401, { "WWW-Authenticate": 'Bearer realm="investing"' });
  }

  // No request parameter may select a profile, table, output field, or credential.
  if (new URL(req.url).search) return json({ error: "query_parameters_not_supported" }, 400);
  const userId = env("INVESTING_WEALTHWISE_USER_ID");
  const supabaseUrl = env("SUPABASE_URL");
  if (!userId?.trim() || !serviceKey || !supabaseUrl) return json({ error: "integration_unavailable" }, 503);

  let url: URL;
  try {
    url = new URL(supabaseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
    url.pathname = "/rest/v1/wealthwise_profiles";
    url.searchParams.set("select", "data,updated_at");
    // Quoted PostgREST literal, then URL-encoded, including reserved characters.
    url.searchParams.set("user_id", `eq."${userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    url.searchParams.set("limit", "1");
  } catch {
    return json({ error: "integration_unavailable" }, 503);
  }

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      redirect: "error",
      cache: "no-store",
    });
    if (!upstream.ok) return json({ error: "snapshot_unavailable" }, 502);
    const rows: unknown = await upstream.json();
    if (!Array.isArray(rows) || rows.length > 1) throw new Error();
    if (!rows.length) return json({ error: "profile_not_found" }, 404);
    return json(normalizeSnapshot(rows[0]));
  } catch {
    // Never echo or log upstream bodies, headers, stored documents, or credentials.
    return json({ error: "snapshot_unavailable" }, 502);
  }
}

// Handle all methods so writes/OPTIONS/HEAD receive an explicit 405.
export const config = { path: "/api/investing/portfolio-snapshot" };
