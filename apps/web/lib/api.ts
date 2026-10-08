import type { ApiTelemetry, DailyEnergy, InverterStatus, Reading } from "./types";

const apiBase = process.env.NEXT_PUBLIC_TAQATI_API_URL?.replace(/\/$/, "") ?? "";
const siteId = process.env.NEXT_PUBLIC_TAQATI_SITE_ID ?? "";

export const apiConfig = { apiBase, siteId, configured: Boolean(apiBase && siteId) } as const;

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
  if (!response.ok) throw new Error(`request failed with status ${response.status}`);
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

export async function checkHealth(): Promise<boolean> {
  const body = (await getJson("/api/health")) as { status?: string } | null;
  return body?.status === "ok";
}
