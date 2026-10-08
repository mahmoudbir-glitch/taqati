"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiConfig, fetchDaily, fetchReadings } from "../lib/api";
import { demoDaily, demoToday } from "../lib/demo";
import { deriveAlerts, deriveEvents, integrate } from "../lib/energy";
import { dayKey, startOfDay } from "../lib/format";
import {
  ACKED_ALERTS_KEY,
  applyTheme,
  defaultSettings,
  readStored,
  sanitizeSettings,
  SETTINGS_KEY,
  writeStored,
} from "../lib/settings";
import type { DailyEnergy, DataMode, EnergyTotals, Reading, Settings, SystemAlert, SystemEvent } from "../lib/types";

const TICK_MS = 5000;
const HISTORY_REFRESH_MS = 5 * 60_000;
const HISTORY_LIMIT = 300; // the API maximum
const DAILY_DAYS = 30;

type TelemetryContextValue = {
  /** False until the first data (or the first failure) is known on the client. */
  ready: boolean;
  mode: DataMode;
  now: number;
  /** Readings since local midnight, oldest first. */
  today: Reading[];
  latest: Reading | null;
  todayTotals: EnergyTotals;
  /** Daily totals, oldest first; null when the API cannot provide them. */
  daily: DailyEnergy[] | null;
  alerts: SystemAlert[];
  events: SystemEvent[];
  ackedIds: string[];
  /** Number of unacknowledged warnings and critical alerts. */
  attentionCount: number;
  acknowledge: (id: string) => void;
  settings: Settings;
  saveSettings: (settings: Settings) => void;
  resetSettings: () => void;
};

const TelemetryContext = createContext<TelemetryContextValue | null>(null);

export function useTelemetry() {
  const value = useContext(TelemetryContext);
  if (!value) throw new Error("useTelemetry must be used inside TelemetryProvider");
  return value;
}

type AckState = { day: string; ids: string[] };

export function TelemetryProvider({ children }: { children: ReactNode }) {
  // Time-dependent values are set after mount so server and client render the same HTML.
  const [now, setNow] = useState(0);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [acked, setAcked] = useState<AckState>({ day: "", ids: [] });
  const [liveReadings, setLiveReadings] = useState<Reading[]>([]);
  const [liveDaily, setLiveDaily] = useState<DailyEnergy[] | null>(null);
  const [answered, setAnswered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSettings(sanitizeSettings(readStored<unknown>(SETTINGS_KEY, null)));
    setAcked(readStored<AckState>(ACKED_ALERTS_KEY, { day: "", ids: [] }));
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    if (!apiConfig.configured) return;
    let cancelled = false;

    const loadHistory = async () => {
      try {
        const rows = await fetchReadings(HISTORY_LIMIT);
        if (cancelled) return;
        setLiveReadings(rows);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setAnswered(true);
      }
    };

    const loadLatest = async () => {
      if (document.hidden) return;
      try {
        const [row] = await fetchReadings(1);
        if (cancelled) return;
        setFailed(false);
        if (!row) return;
        setLiveReadings((current) =>
          current.some((reading) => reading.id === row.id) ? current : [...current, row].slice(-HISTORY_LIMIT),
        );
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    const loadDaily = async () => {
      try {
        const rows = await fetchDaily(DAILY_DAYS);
        if (!cancelled) setLiveDaily(rows);
      } catch {
        if (!cancelled) setLiveDaily(null);
      }
    };

    void loadHistory();
    void loadDaily();
    const latestTimer = window.setInterval(loadLatest, TICK_MS);
    const historyTimer = window.setInterval(() => {
      if (document.hidden) return;
      void loadHistory();
      void loadDaily();
    }, HISTORY_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(latestTimer);
      window.clearInterval(historyTimer);
    };
  }, []);

  const mode: DataMode = !apiConfig.configured ? "demo" : failed ? "error" : "live";
  const ready = now > 0 && (mode === "demo" || answered);
  const dayStart = now > 0 ? startOfDay(now) : 0;
  const dailySlot = Math.floor(now / HISTORY_REFRESH_MS);

  const today = useMemo(() => {
    if (now === 0) return [];
    if (!apiConfig.configured) return demoToday(now, settings);
    return liveReadings.filter((reading) => reading.at >= dayStart);
  }, [now, dayStart, settings, liveReadings]);

  const daily = useMemo(() => {
    if (apiConfig.configured) return liveDaily;
    return dailySlot > 0 ? demoDaily(DAILY_DAYS, dailySlot * HISTORY_REFRESH_MS, settings) : null;
  }, [dailySlot, settings, liveDaily]);

  const latest = apiConfig.configured ? (liveReadings[liveReadings.length - 1] ?? null) : (today[today.length - 1] ?? null);

  const todayTotals = useMemo(() => integrate(today), [today]);
  const alerts = useMemo(
    () => (latest && now > 0 ? deriveAlerts(latest, settings, now, apiConfig.configured) : []),
    [latest, settings, now],
  );
  const events = useMemo(() => deriveEvents(today, settings), [today, settings]);

  // Acknowledgements last for the day they were made.
  const todayKey = now > 0 ? dayKey(now) : "";
  const ackedIds = useMemo(() => (acked.day === todayKey ? acked.ids : []), [acked, todayKey]);
  const attentionCount = alerts.filter((alert) => alert.severity !== "info" && !ackedIds.includes(alert.id)).length;

  const acknowledge = useCallback(
    (id: string) => {
      setAcked((current) => {
        const ids = current.day === todayKey ? current.ids : [];
        const next = { day: todayKey, ids: ids.includes(id) ? ids : [...ids, id] };
        writeStored(ACKED_ALERTS_KEY, next);
        return next;
      });
    },
    [todayKey],
  );

  const saveSettings = useCallback((next: Settings) => {
    const clean = sanitizeSettings(next);
    setSettings(clean);
    writeStored(SETTINGS_KEY, clean);
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
    writeStored(SETTINGS_KEY, defaultSettings);
  }, []);

  const value = useMemo<TelemetryContextValue>(
    () => ({
      ready,
      mode,
      now,
      today,
      latest,
      todayTotals,
      daily,
      alerts,
      events,
      ackedIds,
      attentionCount,
      acknowledge,
      settings,
      saveSettings,
      resetSettings,
    }),
    [ready, mode, now, today, latest, todayTotals, daily, alerts, events, ackedIds, attentionCount, acknowledge, settings, saveSettings, resetSettings],
  );

  return <TelemetryContext.Provider value={value}>{children}</TelemetryContext.Provider>;
}
