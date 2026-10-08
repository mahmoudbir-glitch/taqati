import type { TaqatiTelemetryMessage } from "@taqati/shared";
import type { SmartessLastData, SmartessPar } from "./smartess.client";

/**
 * Maps a SmartESS "last data" payload to Taqati's normalized telemetry.
 *
 * Parameters are matched by their English label (the same labels the SmartESS app
 * shows, e.g. "Battery percentage", "Grid Power"). Labels that are not mapped are
 * kept under `meta.extra` so nothing is lost and the mapping can be tuned later.
 */

const LABELS = {
  solarPower: ["pv power"],
  pvVoltage: ["pv voltage"],
  pvCurrent: ["pv current"],
  loadPower: ["output active power"],
  loadApparent: ["output apparent power"],
  gridPower: ["grid power"],
  gridVoltage: ["grid voltage"],
  gridFrequency: ["grid frequency"],
  batterySoc: ["battery percentage", "battery capacity"],
  batteryVoltage: ["battery voltage"],
  batteryCurrent: ["battery current"],
  batteryPower: ["battery power"],
} as const;

const EXTRA_LABELS: Record<string, string> = {
  "pv voltage": "pvVoltageV",
  "pv current": "pvCurrentA",
  "output voltage": "outputVoltageV",
  "output current": "outputCurrentA",
  "output frequency": "outputFrequencyHz",
  "output apparent power": "outputApparentPowerVA",
  "pv charge power": "pvChargePowerW",
  "ac charging current": "acChargingCurrentA",
  "pv charging current": "pvChargingCurrentA",
};

const normalizeLabel = (label: string) => label.trim().toLowerCase().replace(/\s+/g, " ");

function toNumber(par: SmartessPar | undefined): number | undefined {
  if (!par) return undefined;
  const value = parseFloat(par.val);
  return Number.isFinite(value) ? value : undefined;
}

function toWatts(par: SmartessPar | undefined): number | undefined {
  const value = toNumber(par);
  if (value === undefined) return undefined;
  return par?.unit?.trim().toLowerCase() === "kw" ? value * 1000 : value;
}

export interface MapOptions {
  /** Offset of the device clock used by `gts`, e.g. "+03:00". */
  timezoneOffset: string;
  now?: Date;
}

/** `gts` looks like "2026-10-08 11:50:00" in the device/site timezone. */
export function parseGts(gts: string | undefined, timezoneOffset: string, fallback: Date): Date {
  if (!gts) return fallback;
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(gts.trim());
  if (!match) return fallback;
  const parsed = new Date(`${match[1]}T${match[2]}${timezoneOffset}`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function mapLastData(data: SmartessLastData, options: MapOptions): TaqatiTelemetryMessage | null {
  const byLabel = new Map<string, SmartessPar>();
  for (const par of data.pars) {
    const key = normalizeLabel(par.par);
    if (!byLabel.has(key)) byLabel.set(key, par);
  }
  const find = (labels: readonly string[]) => {
    for (const label of labels) {
      const found = byLabel.get(label);
      if (found) return found;
    }
    return undefined;
  };

  const pvVoltage = toNumber(find(LABELS.pvVoltage));
  const pvCurrent = toNumber(find(LABELS.pvCurrent));
  const solarPowerW =
    toWatts(find(LABELS.solarPower)) ??
    (pvVoltage !== undefined && pvCurrent !== undefined ? Math.round(pvVoltage * pvCurrent) : undefined);
  const loadPowerW = toWatts(find(LABELS.loadPower)) ?? toWatts(find(LABELS.loadApparent));
  const gridPowerW = toWatts(find(LABELS.gridPower));

  const soc = toNumber(find(LABELS.batterySoc));
  const batteryVoltage = toNumber(find(LABELS.batteryVoltage));
  const batteryCurrent = toNumber(find(LABELS.batteryCurrent));
  const batteryPowerRaw =
    toWatts(find(LABELS.batteryPower)) ??
    (batteryVoltage !== undefined && batteryCurrent !== undefined ? batteryVoltage * batteryCurrent : undefined);

  // Nothing recognizable: let the caller treat this as "no data".
  if (solarPowerW === undefined && loadPowerW === undefined && gridPowerW === undefined && soc === undefined) {
    return null;
  }

  // Direction: a negative battery power means discharging; otherwise use the
  // energy balance (grid + solar - load), assuming grid import is positive.
  let direction: "charging" | "discharging" | "idle" | "unknown" = "unknown";
  if (batteryPowerRaw !== undefined) {
    if (batteryPowerRaw < 0) {
      direction = "discharging";
    } else if (gridPowerW !== undefined && loadPowerW !== undefined) {
      const surplus = gridPowerW + (solarPowerW ?? 0) - loadPowerW;
      direction = surplus > 20 ? "charging" : surplus < -20 ? "discharging" : "idle";
    } else {
      direction = batteryPowerRaw > 20 ? "charging" : "idle";
    }
  }

  const extra: Record<string, number> = {};
  for (const [label, key] of Object.entries(EXTRA_LABELS)) {
    const value = label.endsWith("power") ? toWatts(byLabel.get(label)) : toNumber(byLabel.get(label));
    if (value !== undefined) extra[key] = value;
  }

  const now = options.now ?? new Date();
  const message: TaqatiTelemetryMessage = {
    schemaVersion: 1,
    timestamp: parseGts(data.gts, options.timezoneOffset, now).toISOString(),
    inverter: {
      status: "online",
      solarPowerW,
      loadPowerW,
      gridPowerW,
      gridVoltageV: toNumber(find(LABELS.gridVoltage)),
      gridFrequencyHz: toNumber(find(LABELS.gridFrequency)),
    },
    battery: {
      soc,
      voltageV: batteryVoltage,
      currentA: batteryCurrent,
      powerW: batteryPowerRaw === undefined ? undefined : Math.abs(Math.round(batteryPowerRaw)),
      direction,
    },
    meta: { source: "smartess-cloud", extra },
  };
  return message;
}
