import { unstable_cache } from "next/cache";
import { integrate } from "../energy";
import type { DailyEnergy, Reading } from "../types";
import { passwordConfigured } from "./session";
import { sha1, SmartessClient, type SmartessConfig, type SmartessDevice } from "./smartess/client";
import { hasHeadlineData, mapDayRows, mapLastData, type DayReading } from "./smartess/mapper";

// Built-in backend: when the web app is deployed without the Taqati API, these
// functions read the SmartESS cloud directly, on demand, and answer in the same
// shapes as the API's telemetry endpoints. History comes from what SmartESS
// keeps (readings every ~5 minutes); it has no battery charge-level history.

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
export const BUILT_IN_GATEWAY = "smartess-cloud";

export type BackendState = { enabled: true } | { enabled: false; reason: "no-account" | "no-password" };

/** The account lives in server-side environment variables; a site password is mandatory. */
export function backendState(): BackendState {
  if (!process.env.SMARTESS_USERNAME?.trim() || !process.env.SMARTESS_PASSWORD) return { enabled: false, reason: "no-account" };
  if (!passwordConfigured()) return { enabled: false, reason: "no-password" };
  return { enabled: true };
}

const timezoneOffset = () => process.env.SMARTESS_TIMEZONE_OFFSET || "+03:00";

function offsetMs() {
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(timezoneOffset());
  return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) * 60_000 : 0;
}

/** Calendar day (YYYY-MM-DD) in the device timezone, `daysAgo` days back. */
const deviceDate = (daysAgo = 0) => new Date(Date.now() + offsetMs() - daysAgo * DAY_MS).toISOString().slice(0, 10);

function account(): SmartessConfig {
  const env = process.env;
  return {
    baseUrl: env.SMARTESS_API_BASE || "https://api.dessmonitor.com/public/",
    authAction: env.SMARTESS_AUTH_ACTION || undefined,
    username: (env.SMARTESS_USERNAME ?? "").trim(),
    passwordSha1: sha1(env.SMARTESS_PASSWORD ?? ""),
    // Public client key used by the SmartESS web app.
    companyKey: env.SMARTESS_COMPANY_KEY || "bnrl_frRFjEz8Mkn",
    source: env.SMARTESS_SOURCE || "1",
  };
}

// One client per server instance keeps the SmartESS session between requests.
let client: Promise<{ client: SmartessClient; device: SmartessDevice }> | undefined;

async function connect() {
  const devices = await new SmartessClient(account()).listDevices();
  const wanted = process.env.SMARTESS_DEVICE_PN?.trim();
  const device = (wanted ? devices.find((item) => item.pn === wanted) : undefined) ?? devices[0];
  if (!device) throw new Error("no device was found on the SmartESS account");
  return { client: new SmartessClient({ ...account(), device }), device };
}

function connection() {
  client ??= connect().catch((error) => {
    client = undefined; // let the next request try again
    throw error;
  });
  return client;
}

const mask = (value: string) => (value.length <= 4 ? "••••" : `••••${value.slice(-4)}`);

export async function connectionStatus() {
  const username = (process.env.SMARTESS_USERNAME ?? "").trim();
  try {
    const { device } = await connection();
    const latest = await latestRow();
    return { ok: true as const, username: `${username.slice(0, 2)}••••`, devicePn: mask(device.pn), deviceSn: mask(device.sn), lastReadingAt: latest?.recordedAt ?? null };
  } catch (error) {
    return { ok: false as const, username: `${username.slice(0, 2)}••••`, error: error instanceof Error ? error.message : String(error) };
  }
}

/** A row shaped like the API's `telemetry/latest` response. */
export type LatestRow = {
  id: string;
  recordedAt: string;
  gatewayId: string;
  inverterId: null;
  solarPowerW: number | null;
  loadPowerW: number | null;
  gridPowerW: number | null;
  batterySoc: number | null;
  batteryVoltage: number | null;
  batteryCurrent: number | null;
  batteryPowerW: number | null;
  inverterTemperature: number | null;
  gridVoltage: number | null;
  gridFrequency: number | null;
  inverterStatus: "ONLINE";
};

// The collector uploads about every 5 minutes, so a minute of caching loses
// nothing and keeps a page that polls every few seconds from flooding SmartESS.
const latestRow = unstable_cache(
  async (): Promise<LatestRow | null> => {
    const { client: smartess } = await connection();
    const message = mapLastData(await smartess.fetchLastData(hasHeadlineData), { timezoneOffset: timezoneOffset() });
    if (!message) return null;
    const direction = message.battery?.direction;
    const signed = (value: number | undefined) => (value === undefined ? null : direction === "discharging" ? -Math.abs(value) : value);
    return {
      id: `smartess-${message.timestamp}`,
      recordedAt: message.timestamp,
      gatewayId: BUILT_IN_GATEWAY,
      inverterId: null,
      solarPowerW: message.inverter.solarPowerW ?? null,
      loadPowerW: message.inverter.loadPowerW ?? null,
      gridPowerW: message.inverter.gridPowerW ?? null,
      batterySoc: message.battery?.soc ?? null,
      batteryVoltage: message.battery?.voltageV ?? null,
      batteryCurrent: signed(message.battery?.currentA),
      batteryPowerW: signed(message.battery?.powerW),
      inverterTemperature: message.inverter.temperatureC ?? null,
      gridVoltage: message.inverter.gridVoltageV ?? null,
      gridFrequency: message.inverter.gridFrequencyHz ?? null,
      inverterStatus: "ONLINE",
    };
  },
  ["taqati-smartess-latest"],
  { revalidate: 60 },
);

export const getLatest = async () => {
  const row = await latestRow();
  return row ? [row] : [];
};

const fetchDay = async (date: string): Promise<DayReading[]> => {
  const { client: smartess } = await connection();
  return mapDayRows(await smartess.fetchDayRows(date), timezoneOffset());
};

// Today keeps growing; earlier days are final apart from late uploads.
const todayReadings = unstable_cache(fetchDay, ["taqati-smartess-day-live"], { revalidate: 120 });
const pastReadings = unstable_cache(fetchDay, ["taqati-smartess-day-past"], { revalidate: 6 * 3600 });

const dayReadings = (daysAgo: number) => (daysAgo === 0 ? todayReadings(deviceDate(0)) : pastReadings(deviceDate(daysAgo)));

/** Rows shaped like the API's `telemetry/series` response, oldest first. */
export async function getSeries(since: number) {
  // The browser's midnight can fall on the device's previous calendar day.
  const needYesterday = since < Date.parse(`${deviceDate(0)}T00:00:00${timezoneOffset()}`);
  const days = await Promise.all([needYesterday ? dayReadings(1) : Promise.resolve([]), dayReadings(0)]);
  return days
    .flat()
    .map((reading) => ({
      at: Date.parse(reading.timestamp),
      solarPowerW: reading.solarPowerW,
      loadPowerW: reading.loadPowerW,
      gridPowerW: reading.gridPowerW,
      batteryPowerW: reading.batteryPowerW,
      batterySoc: null,
      batteryVoltage: reading.batteryVoltageV,
      batteryCurrent: reading.batteryCurrentA,
      inverterTemperature: reading.temperatureC,
      gridVoltage: reading.gridVoltageV,
      gridFrequency: reading.gridFrequencyHz,
      inverterStatus: "ONLINE",
    }))
    .filter((row) => row.at >= since);
}

const toReading = (reading: DayReading): Reading => ({
  id: reading.timestamp,
  at: Date.parse(reading.timestamp),
  solarW: reading.solarPowerW ?? 0,
  loadW: reading.loadPowerW ?? 0,
  gridW: reading.gridPowerW ?? 0,
  batteryW: reading.batteryPowerW ?? 0,
  soc: null,
  batteryV: reading.batteryVoltageV,
  batteryA: reading.batteryCurrentA,
  gridV: reading.gridVoltageV,
  gridHz: reading.gridFrequencyHz,
  tempC: reading.temperatureC,
  status: "ONLINE",
  gatewayId: BUILT_IN_GATEWAY,
  inverterId: null,
});

/** Energy totals per device-local day, oldest first; days without readings are left out. */
export async function getDaily(days: number): Promise<DailyEnergy[]> {
  const span = Math.min(Math.max(Math.round(days), 1), 30);
  const offsets = Array.from({ length: span }, (_, index) => index);
  const results: DailyEnergy[] = [];
  // A few days at a time: each one is two or three requests to SmartESS.
  for (let start = 0; start < offsets.length; start += 4) {
    const batch = await Promise.all(
      offsets.slice(start, start + 4).map(async (daysAgo) => {
        const readings = await dayReadings(daysAgo);
        return readings.length > 1 ? { date: deviceDate(daysAgo), ...integrate(readings.map(toReading)) } : null;
      }),
    );
    for (const day of batch) if (day) results.push(day);
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
}
