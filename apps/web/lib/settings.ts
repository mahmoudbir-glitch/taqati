import type { Settings, ThemeChoice } from "./types";

export const SETTINGS_KEY = "taqati.settings.v1";
export const ACKED_ALERTS_KEY = "taqati.alerts.acked.v1";

export const defaultSettings: Settings = {
  siteName: "منزلي",
  currency: "USD",
  tariff: 0.3,
  arrayPowerW: 6000,
  inverterPowerW: 6000,
  batteryCapacityWh: 10000,
  reserveSoc: 20,
  theme: "system",
};

export const CURRENCIES = ["USD", "LBP", "SYP", "EUR", "SAR", "AED", "JOD", "EGP"] as const;

const THEMES: readonly ThemeChoice[] = ["system", "light", "dark"];

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

/** Returns valid settings from untrusted input, falling back per field. */
export function sanitizeSettings(input: unknown): Settings {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const d = defaultSettings;
  const siteName = typeof raw.siteName === "string" ? raw.siteName.trim().slice(0, 40) : "";
  return {
    siteName: siteName || d.siteName,
    currency: CURRENCIES.find((currency) => currency === raw.currency) ?? d.currency,
    tariff: clamp(raw.tariff, 0, 1_000_000, d.tariff),
    arrayPowerW: Math.round(clamp(raw.arrayPowerW, 100, 1_000_000, d.arrayPowerW)),
    inverterPowerW: Math.round(clamp(raw.inverterPowerW, 100, 1_000_000, d.inverterPowerW)),
    batteryCapacityWh: Math.round(clamp(raw.batteryCapacityWh, 100, 10_000_000, d.batteryCapacityWh)),
    reserveSoc: Math.round(clamp(raw.reserveSoc, 0, 90, d.reserveSoc)),
    theme: THEMES.find((theme) => theme === raw.theme) ?? d.theme,
  };
}

// Storage can throw in private windows or when site data is blocked.
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The setting still applies for this visit; it just is not remembered.
  }
}

export function applyTheme(theme: ThemeChoice) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
