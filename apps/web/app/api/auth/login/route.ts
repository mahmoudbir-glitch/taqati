import {
  createSessionToken,
  loginLocked,
  passwordConfigured,
  passwordMatches,
  recordLogin,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "../../../../lib/server/session";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function POST(request: Request) {
  if (!passwordConfigured()) return json({ message: "Sign-in is not configured" }, 404);

  // Only the site's own pages may post here.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return json({ message: "Cross-site request refused" }, 403);

  const visitor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (loginLocked(visitor)) return json({ message: "Too many attempts; try again in a minute" }, 429);

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const ok = typeof body?.password === "string" && passwordMatches(body.password);
  recordLogin(visitor, ok);
  if (!ok) return json({ message: "Wrong password" }, 401);

  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const cookie = `${SESSION_COOKIE}=${createSessionToken()}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}
