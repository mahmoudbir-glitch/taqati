import { backendState } from "../../../lib/server/backend";
import { isAuthenticated } from "../../../lib/server/session";

export const dynamic = "force-dynamic";

/** Tells the page which backend it has: the built-in SmartESS reader or none (demo). */
export function GET(request: Request) {
  const state = backendState();
  return Response.json(
    state.enabled ? { backend: "smartess", authenticated: isAuthenticated(request) } : { backend: "none", reason: state.reason },
    { headers: { "Cache-Control": "no-store" } },
  );
}
