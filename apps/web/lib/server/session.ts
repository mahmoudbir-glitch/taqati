import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Single-password login for the built-in backend. The cookie holds an expiry
// time signed with HMAC-SHA256; nothing is stored on the server.

export const SESSION_COOKIE = "taqati_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 3600;
export const MIN_PASSWORD_LENGTH = 8;

const sitePassword = () => process.env.TAQATI_PASSWORD ?? "";

export const passwordConfigured = () => sitePassword().length >= MIN_PASSWORD_LENGTH;

// Changing the password (or AUTH_SECRET) signs everyone out.
const secret = () => process.env.AUTH_SECRET || createHash("sha256").update(`taqati-session:${sitePassword()}`).digest("hex");

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

const equal = (a: string, b: string) => {
  // Hashing first gives equal-length buffers, so the comparison leaks nothing about length.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
};

export const passwordMatches = (candidate: string) => passwordConfigured() && equal(candidate, sitePassword());

export function createSessionToken(now = Date.now()) {
  const expires = String(now + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expires}.${sign(expires)}`;
}

export function isAuthenticated(request: Request, now = Date.now()) {
  if (!passwordConfigured()) return false;
  const cookies = request.headers.get("cookie") ?? "";
  const token = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !equal(signature, sign(expires))) return false;
  return Number(expires) > now;
}

// Best-effort brute-force brake. It lives in one server instance's memory, so
// it slows guessing down rather than stopping a distributed attempt.
const MAX_FAILURES = 5;
const LOCK_MS = 60_000;
const failures = new Map<string, { count: number; lockedUntil: number }>();

export function loginLocked(key: string, now = Date.now()) {
  const entry = failures.get(key);
  return Boolean(entry && entry.lockedUntil > now);
}

export function recordLogin(key: string, ok: boolean, now = Date.now()) {
  if (ok) {
    failures.delete(key);
    return;
  }
  const entry = failures.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.count = 0;
    entry.lockedUntil = now + LOCK_MS;
  }
  failures.set(key, entry);
  if (failures.size > 5000) failures.clear();
}
