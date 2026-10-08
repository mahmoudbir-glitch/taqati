import { integrate, LOW_SOC } from "./energy";
import { dayKey, startOfDay } from "./format";
import type { DailyEnergy, Reading } from "./types";

// Deterministic demo model of a home solar system, used only when no API is
// configured. The same moment always yields the same values, so every page
// agrees with the others.

const STEP_MS = 5 * 60_000;
const DAY_MS = 24 * 3_600_000;
const SUNRISE_H = 6;
const SUNSET_H = 18.5;
const CHARGE_EFFICIENCY = 0.95;
const NOMINAL_BATTERY_V = 51.2;
const GRID_V = 230;
// The imaginary system being simulated.
const ARRAY_W = 6000;
const INVERTER_W = 6000;
const BATTERY_WH = 10_000;

// Hash-style pseudo random number in [0, 1) for an integer-ish seed.
const noise = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const bump = (hour: number, center: number, width: number) => Math.exp(-((hour - center) ** 2) / (2 * width ** 2));

const dayIndex = (at: number) => Math.round(startOfDay(at) / DAY_MS);
// A 5-minute slot gets a stable ripple; an in-between "now" sample moves every 5 s.
const rippleSeed = (at: number) => (at % STEP_MS === 0 ? at / STEP_MS : Math.floor(at / 5000) + 0.5);
const hourOf = (at: number) => (at - startOfDay(at)) / 3_600_000;

function availableSolarW(at: number) {
  const hour = hourOf(at);
  if (hour <= SUNRISE_H || hour >= SUNSET_H) return 0;
  const position = (hour - SUNRISE_H) / (SUNSET_H - SUNRISE_H);
  const clearSky = Math.sin(Math.PI * position) ** 1.6 * ARRAY_W * 0.88;
  const sky = 0.55 + 0.45 * noise(dayIndex(at)); // how clear the whole day is
  return clearSky * sky * (0.9 + 0.1 * noise(rippleSeed(at)));
}

function demandW(at: number) {
  const hour = hourOf(at);
  const base = 420 + bump(hour, 7.5, 1.2) * 1100 + bump(hour, 14, 2.6) * 1900 + bump(hour, 20, 1.8) * 1700;
  return base * (0.9 + 0.2 * noise(rippleSeed(at) + 7));
}

function simulateDay(dayStart: number, until: number): Reading[] {
  const capacityWh = BATTERY_WH;
  const maxBatteryW = INVERTER_W * 0.6;
  const times: number[] = [];
  for (let at = dayStart; at <= until; at += STEP_MS) times.push(at);
  if (times[times.length - 1] !== until) times.push(until);

  let soc = 26 + 10 * noise(dayIndex(dayStart) + 3);
  let previousAt = dayStart;
  const readings: Reading[] = [];

  for (const at of times) {
    const load = demandW(at);
    const available = availableSolarW(at);
    let solar = available;
    let battery = 0; // > 0 charging
    let grid = 0; // > 0 importing

    if (available >= load) {
      // No export in the demo site: the inverter curtails what it cannot store.
      const room = soc < 100 ? maxBatteryW * Math.min(1, (100 - soc) / 15) : 0;
      battery = Math.min(available - load, room);
      solar = load + battery;
    } else {
      const deficit = load - available;
      const discharge = soc > LOW_SOC ? Math.min(deficit, maxBatteryW) : 0;
      battery = -discharge;
      grid = deficit - discharge;
    }

    const hours = (at - previousAt) / 3_600_000;
    const delta = battery > 0 ? battery * CHARGE_EFFICIENCY : battery;
    soc = Math.min(100, Math.max(0, soc + ((delta * hours) / capacityWh) * 100));
    previousAt = at;

    const batteryV = NOMINAL_BATTERY_V * (0.94 + 0.1 * (soc / 100));
    readings.push({
      id: `demo-${at}`,
      at,
      solarW: Math.round(solar),
      loadW: Math.round(load),
      gridW: Math.round(grid),
      batteryW: Math.round(battery),
      soc: Math.round(soc * 10) / 10,
      batteryV: Math.round(batteryV * 10) / 10,
      batteryA: Math.round((battery / batteryV) * 10) / 10,
      gridV: GRID_V,
      gridHz: 50,
      tempC: Math.round(31 + (load / INVERTER_W) * 18),
      status: "ONLINE",
      gatewayId: "demo-gateway",
      inverterId: "demo-inverter",
    });
  }
  return readings;
}

/** Demo readings from local midnight up to `now`. */
export const demoToday = (now: number): Reading[] => simulateDay(startOfDay(now), now);

/** Demo daily totals for the last `days` days, oldest first, ending with today so far. */
export function demoDaily(days: number, now: number): DailyEnergy[] {
  const result: DailyEnergy[] = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const date = new Date(startOfDay(now));
    date.setDate(date.getDate() - back);
    const dayStart = date.getTime();
    const until = back === 0 ? now : dayStart + DAY_MS - STEP_MS;
    result.push({ date: dayKey(dayStart), ...integrate(simulateDay(dayStart, until)) });
  }
  return result;
}
