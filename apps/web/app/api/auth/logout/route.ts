import { SESSION_COOKIE } from "../../../../lib/server/session";

export const dynamic = "force-dynamic";

export function POST() {
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store", "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` } },
  );
}
