import type { ApiTelemetry, DailyEnergy, InverterStatus, Reading } from "./types";

const externalBase = process.env.NEXT_PUBLIC_TAQATI_API_URL?.replace(/\/$/, "") ?? "";
const externalSite = process.env.NEXT_PUBLIC_TAQATI_SITE_ID ?? "";

/** A separately hosted Taqati API, chosen at build time. */
export const apiConfig = { apiBase: externalBase, siteId: externalSite, configured: Boolean(externalBase && externalSite) } as const;

// Requests go to the external API when one is configured, otherwise to this
// site's own /api routes (the built-in SmartESS backend), which need no base URL.
const apiBase = apiConfig.configured ? externalBase : "";
const siteId = apiConfig.configured ? externalSite : "home";

/**
 * Where readings come from:
 * - "external": a hosted Taqati API;
 * - "builtin": this site reading SmartESS itself, behind a sign-in (`locked` until signed in);
 * - "none": nothing is configured, so demo data is shown.
 */
export type BackendInfo = { kind: "external" | "builtin" | "none"; locked: boolean; reason?: "no-account" | "no-password" };

export async function resolveBackend(): Promise<BackendInfo> {
  if (apiConfig.configured) return { kind: "external", locked: false };
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    const body = (await response.json()) as { backend?: string; authenticated?: boolean; reason?: BackendInfo["reason"] };
    if (response.ok && body.backend === "smartess") return { kind: "builtin", locked: !body.authenticated };
    return { kind: "none", locked: false, reason: body.reason };
  } catch {
    return { kind: "none", locked: false };
  }
}

/** Signs in to the built-in backend; resolves to an error message, or null on success. */
export async function signIn(password: string): Promise<string | null> {
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (response.ok) return null;
    if (response.status === 401) return "كلمة المرور غير صحيحة.";
    if (response.status === 429) return "محاولات كثيرة. انتظر دقيقة ثم حاول مجددًا.";
    return "تعذّر تسجيل الدخول.";
  } catch {
    return "تعذّر الاتصال بالموقع.";
  }
}

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST", cache: "no-store" }).catch(() => undefined);
}

export type BuiltinStatus =
  | { ok: true; username: string; devicePn: string; deviceSn: string; lastReadingAt: string | null }
  | { ok: false; username: string; error: string };

export const fetchBuiltinStatus = async () => (await getJson(`/api/sites/${siteId}/smartess`)) as BuiltinStatus;

// Prisma Decimal columns are serialized as strings by the API.
const num = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const numOrNull = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const STATUSES: readonly InverterStatus[] = ["ONLINE", "OFFLINE", "FAULT", "UNKNOWN"];

function toReading(row: ApiTelemetry): Reading | null {
  const at = new Date(row.recordedAt).getTime();
  if (Number.isNaN(at)) return null;
  return {
    id: String(row.id),
    at,
    solarW: num(row.solarPowerW),
    loadW: num(row.loadPowerW),
    gridW: num(row.gridPowerW),
    batteryW: num(row.batteryPowerW),
    soc: numOrNull(row.batterySoc),
    batteryV: numOrNull(row.batteryVoltage),
    batteryA: numOrNull(row.batteryCurrent),
    gridV: numOrNull(row.gridVoltage),
    gridHz: numOrNull(row.gridFrequency),
    tempC: numOrNull(row.inverterTemperature),
    status: STATUSES.find((status) => status === row.inverterStatus) ?? "UNKNOWN",
    gatewayId: row.gatewayId ?? null,
    inverterId: row.inverterId ?? null,
  };
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${apiBase}${path}`, { cache: "no-store" });
  if (!response.ok) throw new ApiError(response.status, `request failed with status ${response.status}`);
  return response.json();
}

/** Latest readings for the configured site, oldest first. */
export async function fetchReadings(limit: number): Promise<Reading[]> {
  const rows = await getJson(`/api/sites/${encodeURIComponent(siteId)}/telemetry/latest?limit=${limit}`);
  if (!Array.isArray(rows)) throw new Error("unexpected telemetry response");
  return (rows as ApiTelemetry[])
    .map(toReading)
    .filter((reading): reading is Reading => reading !== null)
    .sort((a, b) => a.at - b.at);
}

/**
 * Readings since `since` averaged into 5-minute buckets, oldest first. Unlike
 * `fetchReadings`, the window does not shrink when the gateway reports often.
 */
export async function fetchSeries(since: number): Promise<Reading[]> {
  const rows = await getJson(`/api/sites/${encodeURIComponent(siteId)}/telemetry/series?since=${Math.floor(since)}`);
  if (!Array.isArray(rows)) throw new Error("unexpected series response");
  return (rows as Array<ApiTelemetry & { at: number }>)
    .map((row) => toReading({ ...row, id: `bucket-${row.at}`, recordedAt: new Date(Number(row.at)).toISOString() }))
    .filter((reading): reading is Reading => reading !== null)
    .sort((a, b) => a.at - b.at);
}

/** Daily energy totals for the configured site, oldest first. */
export async function fetchDaily(days: number): Promise<DailyEnergy[]> {
  const rows = await getJson(`/api/sites/${encodeURIComponent(siteId)}/telemetry/daily?days=${days}`);
  if (!Array.isArray(rows)) throw new Error("unexpected daily response");
  return (rows as Record<string, unknown>[])
    .filter((row) => typeof row.date === "string")
    .map((row) => ({
      date: row.date as string,
      solarWh: num(row.solarWh as number),
      loadWh: num(row.loadWh as number),
      gridImportWh: num(row.gridImportWh as number),
      gridExportWh: num(row.gridExportWh as number),
      batteryChargeWh: num(row.batteryChargeWh as number),
      batteryDischargeWh: num(row.batteryDischargeWh as number),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type SmartessStatus = {
  source: "database" | "environment" | "none";
  enabled: boolean;
  /** Masked by the server. */
  username: string | null;
  devicePn: string | null;
  deviceSn: string | null;
  polling: boolean;
  lastPollAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  canEdit: boolean;
};

export type SmartessAccount = {
  username: string;
  /** Empty keeps the password already stored on the server. */
  password: string;
  devicePn: string;
  deviceSn: string;
  enabled: boolean;
};

export type SmartessTestResult =
  | { ok: true; deviceSn: string; timestamp: string; solarPowerW: number | null; loadPowerW: number | null; batterySoc: number | null }
  | { ok: false; error: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const smartessPath = () => `/api/sites/${encodeURIComponent(siteId)}/smartess`;

/** Calls an admin endpoint; `token` is the server's ADMIN_TOKEN and is never stored. */
async function adminRequest(method: "PUT" | "POST" | "DELETE", path: string, token: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = (data as { message?: unknown } | null)?.message;
    throw new ApiError(response.status, Array.isArray(detail) ? detail.join(", ") : typeof detail === "string" ? detail : "request failed");
  }
  return data;
}

export const fetchSmartessStatus = async () => (await getJson(smartessPath())) as SmartessStatus;

export const saveSmartess = async (token: string, account: SmartessAccount) =>
  (await adminRequest("PUT", smartessPath(), token, account)) as SmartessStatus;

export const testSmartess = async (token: string, account: SmartessAccount) =>
  (await adminRequest("POST", `${smartessPath()}/test`, token, account)) as SmartessTestResult;

export const removeSmartess = async (token: string) => (await adminRequest("DELETE", smartessPath(), token)) as SmartessStatus;
