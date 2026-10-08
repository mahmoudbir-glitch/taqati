import { backendState } from "./backend";
import { isAuthenticated } from "./session";

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Runs a built-in backend handler only when the backend is configured and the
 * visitor is signed in. SmartESS failures become a 502 with the service's message.
 */
export async function guarded(request: Request, handler: () => Promise<unknown>): Promise<Response> {
  if (!backendState().enabled) return json({ message: "The built-in backend is not configured" }, 404);
  if (!isAuthenticated(request)) return json({ message: "Sign in required" }, 401);
  try {
    return json(await handler(), 200);
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : "SmartESS request failed" }, 502);
  }
}

export const intParam = (request: Request, name: string) => {
  const raw = new URL(request.url).searchParams.get(name);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : undefined;
};
