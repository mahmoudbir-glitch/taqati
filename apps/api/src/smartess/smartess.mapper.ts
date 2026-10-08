import type { TaqatiTelemetryMessage } from "@taqati/shared";
import type { SmartessLastData, SmartessPar } from "./smartess.client";

/**
 * Maps SmartESS parameters to Taqati's normalized telemetry.
 *
 * Labels differ between firmware versions and device codes, so parameters are
 * matched on their human-readable (English) label with patterns rather than on
 * fixed ids. Anything not mapped is kept under `meta.extra` so nothing is lost.
 * The matching rules follow the ones proven in the Solar project.
 */

const text = (label: string) => label.replace(/_+/g, " ");

function toNumber(value: string): number | undefined {
  const cleaned = String(value).replace(/[^\d.+-]/g, "");
  // "", "N/A" or "--" mean "no value", not 0 (a blank grid voltage read as 0 V
  // would look like a grid outage).
  if (!/\d/.test(cleaned)) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const isKilowatt = (unit: string | undefined) => /^\s*kw\b/i.test(unit ?? "");

/** First parameter whose label matches `pattern` and whose unit fits `expectedUnit`. */
function pick(pars: SmartessPar[], pattern: RegExp, expectedUnit?: string): number | undefined {
  for (const par of pars) {
    if (!pattern.test(text(par.par))) continue;
    if (expectedUnit && par.unit && !par.unit.toLowerCase().includes(expectedUnit.toLowerCase())) continue;
    const numeric = toNumber(par.val);
    if (numeric === undefined) continue;
    // "kW".includes("W") is true, so scale kilowatts explicitly.
    return expectedUnit === "W" && isKilowatt(par.unit) ? numeric * 1000 : numeric;
  }
  return undefined;
}

const NOT_PV = /^(?!.*\b(pv|solar)\b)/i;
const CHARGE_CURRENT = /\b(battery|batt)\b.*\bchargn?(e|ing)?\b.*\bcurrent\b/i;
const DISCHARGE_CURRENT = /\b(battery|batt)\b.*\bdischarg\w*\b.*\bcurrent\b/i;
const GENERIC_CURRENT = /\b(battery|batt)\b.*\bcurrent\b/i;

export interface Reading {
  solarPowerW?: number;
  loadPowerW?: number;
  gridPowerW?: number;
  gridVoltageV?: number;
  gridFrequencyHz?: number;
  inverterTemperatureC?: number;
  soc?: number;
  batteryVoltageV?: number;
  /** Positive = charging, negative = discharging, when the cloud reports it that way. */
  batteryCurrentA?: number;
  batteryCurrentSigned: boolean;
  batteryPowerW?: number;
  extra: Record<string, number>;
}

export function extractReading(pars: SmartessPar[]): Reading {
  // Panel power is reported under several labels ("PV Power", "PV Charge Power").
  // In mains mode the inverter can report "PV Power" as 0 while all panel output
  // goes into "PV Charge Power", so the panels produce at least the largest one.
  let pvMax: number | undefined;
  for (const par of pars) {
    const label = text(par.par);
    if (!/\b(pv|solar)\b/i.test(label) || !/\bpower\b/i.test(label)) continue;
    if (par.unit && !/w/i.test(par.unit)) continue;
    const numeric = toNumber(par.val);
    if (numeric === undefined || numeric < 0) continue;
    pvMax = Math.max(pvMax ?? 0, isKilowatt(par.unit) ? numeric * 1000 : numeric);
  }
  const solarPick = pick(pars, /\b(pv|solar)\b.*\b(power|charging power)\b/i, "W");
  const solarPowerW = pvMax === undefined ? solarPick : Math.max(solarPick ?? 0, pvMax);

  const loadPowerW =
    pick(pars, /\boutput\b.*\bactive\b.*\bpower\b/i, "W") ??
    pick(pars, new RegExp(`${NOT_PV.source}.*\\bload\\b.*\\bpower\\b`, "i"), "W") ??
    pick(pars, new RegExp(`${NOT_PV.source}.*\\b(load|output)\\b.*\\b(power|apparent|active)\\b`, "i"), "W");

  // Battery current is often two one-way parameters; the dashboard convention is
  // one signed number (positive charging). A one-way parameter at 0 just means
  // that direction is inactive, so whichever is non-zero wins.
  let charge: number | undefined;
  let discharge: number | undefined;
  let generic: number | undefined;
  for (const par of pars) {
    const numeric = toNumber(par.val);
    if (numeric === undefined) continue;
    const label = text(par.par);
    if (DISCHARGE_CURRENT.test(label)) discharge ??= numeric;
    else if (CHARGE_CURRENT.test(label)) charge ??= numeric;
    else if (GENERIC_CURRENT.test(label)) generic ??= numeric;
  }
  let batteryCurrentA: number | undefined;
  let batteryCurrentSigned = false;
  if (charge !== undefined && charge !== 0) {
    batteryCurrentA = Math.abs(charge);
    batteryCurrentSigned = true;
  } else if (discharge !== undefined && discharge !== 0) {
    batteryCurrentA = -Math.abs(discharge);
    batteryCurrentSigned = true;
  } else if (generic !== undefined) {
    batteryCurrentA = generic;
  } else if (charge !== undefined || discharge !== undefined) {
    batteryCurrentA = 0;
    batteryCurrentSigned = true;
  }

  const batteryVoltageV = pick(pars, /\b(battery|batt)\b.*\bvoltage\b/i, "V");
  let batteryPowerW = pick(pars, /^(?!.*\b(charg|discharg)\w*\b).*\b(battery|batt)\b.*\bpower\b/i, "W");
  if (batteryPowerW === undefined && batteryVoltageV !== undefined && batteryCurrentA !== undefined) {
    batteryPowerW = Math.round(batteryVoltageV * batteryCurrentA);
  }

  const temperatures: number[] = [];
  for (const par of pars) {
    const label = text(par.par);
    if (/\b(dc|inv|inverter)\b.*\bmodule\b.*\bte?r?m?p/i.test(label) || /\binverter\b.*\btemp/i.test(label)) {
      const numeric = toNumber(par.val);
      if (numeric !== undefined) temperatures.push(numeric);
    }
  }

  const extra: Record<string, number> = {};
  const addExtra = (key: string, value: number | undefined) => {
    if (value !== undefined) extra[key] = value;
  };
  addExtra("pvVoltageV", pick(pars, /\b(pv|solar)\b.*\bvoltage\b/i, "V"));
  addExtra("pvCurrentA", pick(pars, /\b(pv|solar)\b.*\bcurrent\b/i, "A"));
  addExtra("outputVoltageV", pick(pars, /\b(ac\s*)?output\b.*\bvoltage\b/i, "V"));
  addExtra("outputCurrentA", pick(pars, /\b(ac\s*)?output\b.*\bcurrent\b/i, "A"));
  addExtra("outputFrequencyHz", pick(pars, /\boutput\b.*\bfreq/i, "Hz"));
  addExtra("outputApparentPowerVA", pick(pars, /\boutput\b.*\bapparent\b.*\bpower\b/i));
  addExtra("loadPercent", pick(pars, /\bload\b.*\b(percent|%)/i));
  addExtra("pvChargePowerW", pick(pars, /\bpv\b.*\bcharg\w*\b.*\bpower\b/i, "W"));
  addExtra("acChargingCurrentA", pick(pars, /\bac\b.*\bcharg\w*\b.*\bcurrent\b/i, "A"));
  addExtra("pvChargingCurrentA", pick(pars, /\bpv\b.*\bcharg\w*\b.*\bcurrent\b/i, "A"));

  return {
    solarPowerW,
    loadPowerW,
    gridPowerW: pick(pars, /\b(grid|utility|mains)\b.*\bpower\b/i, "W"),
    gridVoltageV: pick(pars, /\b(grid|utility|ac\s*input|mains)\b.*\bvoltage\b/i, "V"),
    gridFrequencyHz: pick(pars, /\b(grid|utility|mains|ac\s*input)\b.*\bfreq/i, "Hz"),
    inverterTemperatureC: temperatures.length ? Math.max(...temperatures) : undefined,
    soc: pick(pars, /\b(battery|batt)\b.*\b(capacity|soc|percent|level)\b/i, "%"),
    batteryVoltageV,
    batteryCurrentA,
    batteryCurrentSigned,
    batteryPowerW,
    extra,
  };
}

/** True when the headline figures (PV, load, battery, grid) are all present. */
export function hasHeadlineData(pars: SmartessPar[]): boolean {
  const reading = extractReading(pars);
  return [reading.solarPowerW, reading.loadPowerW, reading.soc, reading.batteryPowerW, reading.gridPowerW].every(
    (value) => value !== undefined,
  );
}

export interface MapOptions {
  /** Offset of the device clock used by `gts`, e.g. "+03:00". */
  timezoneOffset: string;
  now?: Date;
}

const SERVER_OFFSET_MS = 8 * 3_600_000;
const MAX_CLOCK_SKEW_MS = 15 * 60_000;

/**
 * `gts` is the time of the reading, either "2026-10-08 11:50:00" in the
 * device/site timezone or an epoch number (ms or s).
 *
 * The epoch form is not a true instant: observed on the live service, it is the
 * device's local wall-clock time encoded as if it were UTC+8 (the server's own
 * zone), so a 15:04 reading in UTC+3 arrives as 07:04Z. It is shifted back to the
 * device zone here; if that lands in the future the raw value is used instead.
 */
export function parseGts(gts: string | undefined, timezoneOffset: string, fallback: Date): Date {
  if (!gts) return fallback;
  if (/^\d{10,13}$/.test(gts.trim())) {
    const raw = Number(gts.trim());
    const epoch = raw < 1e11 ? raw * 1000 : raw;
    const zone = /^([+-])(\d{2}):(\d{2})$/.exec(timezoneOffset);
    const zoneMs = zone ? (zone[1] === "-" ? -1 : 1) * (Number(zone[2]) * 60 + Number(zone[3])) * 60_000 : 0;
    const latest = fallback.getTime() + MAX_CLOCK_SKEW_MS;
    const candidates = [epoch + SERVER_OFFSET_MS - zoneMs, epoch];
    const chosen = candidates.find((candidate) => candidate <= latest);
    return chosen === undefined ? fallback : new Date(chosen);
  }
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(gts.trim());
  if (!match) return fallback;
  const parsed = new Date(`${match[1]}T${match[2]}${timezoneOffset}`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function mapLastData(data: SmartessLastData, options: MapOptions): TaqatiTelemetryMessage | null {
  const reading = extractReading(data.pars);
  const { solarPowerW, loadPowerW, gridPowerW, soc } = reading;

  // Nothing recognizable: let the caller treat this as "no data".
  if (solarPowerW === undefined && loadPowerW === undefined && gridPowerW === undefined && soc === undefined) {
    return null;
  }

  // Direction: explicit one-way parameters first, then a negative power, then the
  // energy balance (grid + solar - load, grid import positive).
  let direction: "charging" | "discharging" | "idle" | "unknown" = "unknown";
  const current = reading.batteryCurrentA;
  const power = reading.batteryPowerW;
  const surplus =
    gridPowerW !== undefined && loadPowerW !== undefined ? gridPowerW + (solarPowerW ?? 0) - loadPowerW : undefined;
  if (reading.batteryCurrentSigned && current !== undefined) {
    direction = Math.abs(current) < 0.05 ? "idle" : current > 0 ? "charging" : "discharging";
  } else if (power !== undefined && power < 0) {
    direction = "discharging";
  } else if (surplus !== undefined && Math.abs(surplus) > 50) {
    direction = surplus > 0 ? "charging" : "discharging";
  } else if (power !== undefined || current !== undefined) {
    direction = Math.abs(power ?? 0) < 20 && Math.abs(current ?? 0) < 0.5 ? "idle" : "unknown";
  }

  const now = options.now ?? new Date();
  return {
    schemaVersion: 1,
    timestamp: parseGts(data.gts, options.timezoneOffset, now).toISOString(),
    inverter: {
      status: "online",
      solarPowerW,
      loadPowerW,
      gridPowerW,
      temperatureC: reading.inverterTemperatureC,
      gridVoltageV: reading.gridVoltageV,
      gridFrequencyHz: reading.gridFrequencyHz,
    },
    battery: {
      soc,
      voltageV: reading.batteryVoltageV,
      currentA: current === undefined ? undefined : Math.abs(current),
      powerW: power === undefined ? undefined : Math.abs(Math.round(power)),
      direction,
    },
    meta: { source: "smartess-cloud", extra: reading.extra },
  };
}

/** One stored reading of the day table; battery values are signed (positive charging). */
export interface DayReading {
  timestamp: string;
  solarPowerW: number | null;
  loadPowerW: number | null;
  gridPowerW: number | null;
  batteryPowerW: number | null;
  batteryVoltageV: number | null;
  batteryCurrentA: number | null;
  gridVoltageV: number | null;
  gridFrequencyHz: number | null;
  temperatureC: number | null;
}

/**
 * Maps the day table (see `SmartessClient.fetchDayRows`) to readings, oldest
 * first. The table has no battery charge level, and its battery power is a
 * magnitude, so the direction comes from the energy balance of the same row.
 */
export function mapDayRows(table: { titles: string[]; rows: string[][] }, timezoneOffset: string): DayReading[] {
  const column = (pattern: RegExp) => table.titles.findIndex((title) => pattern.test(text(title)));
  const columns = {
    time: column(/^timestamp$/i),
    solar: column(/^pv power$/i),
    solarCharge: column(/^pv charge power$/i),
    load: column(/^output active power$/i),
    grid: column(/^grid power$/i),
    batteryPower: column(/^battery power$/i),
    batteryVoltage: column(/^battery voltage$/i),
    batteryCurrent: column(/^battery current$/i),
    gridVoltage: column(/^grid voltage$/i),
    gridFrequency: column(/^grid frequency$/i),
    temperature: column(/^inv module te?r?m?perature$/i),
  };
  if (columns.time < 0) return [];

  const readings: DayReading[] = [];
  for (const row of table.rows) {
    const value = (index: number) => (index < 0 ? undefined : toNumber(row[index] ?? ""));
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec((row[columns.time] ?? "").trim());
    const at = match ? new Date(`${match[1]}T${match[2]}${timezoneOffset}`) : null;
    if (!at || Number.isNaN(at.getTime())) continue;

    // Same rule as the live reading: the panels produce at least the larger figure.
    const pv = value(columns.solar);
    const pvCharge = value(columns.solarCharge);
    const solar = pv === undefined && pvCharge === undefined ? undefined : Math.max(pv ?? 0, pvCharge ?? 0);
    const load = value(columns.load);
    const grid = value(columns.grid);
    const surplus = (solar ?? 0) + (grid ?? 0) - (load ?? 0);
    const sign = surplus < 0 ? -1 : 1;
    const batteryPower = value(columns.batteryPower);
    const batteryCurrent = value(columns.batteryCurrent);

    readings.push({
      timestamp: at.toISOString(),
      solarPowerW: solar ?? null,
      loadPowerW: load ?? null,
      gridPowerW: grid ?? null,
      batteryPowerW: batteryPower === undefined ? null : sign * Math.abs(batteryPower),
      batteryVoltageV: value(columns.batteryVoltage) ?? null,
      batteryCurrentA: batteryCurrent === undefined ? null : sign * Math.abs(batteryCurrent),
      gridVoltageV: value(columns.gridVoltage) ?? null,
      gridFrequencyHz: value(columns.gridFrequency) ?? null,
      temperatureC: value(columns.temperature) ?? null,
    });
  }
  return readings.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
