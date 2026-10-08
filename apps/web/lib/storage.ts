export const ACKED_ALERTS_KEY = "taqati.alerts.acked.v1";

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
    // The value still applies for this visit; it just is not remembered.
  }
}
