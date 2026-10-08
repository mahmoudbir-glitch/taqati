import { clockTime, THRESHOLD_W } from "./format";
import type { EnergyTotals, Reading, SystemAlert, SystemEvent } from "./types";

// A gap longer than this means the gateway was silent; no energy is assumed for it.
const MAX_GAP_MS = 15 * 60_000;
export const STALE_AFTER_MS = 15 * 60_000;
const HOT_INVERTER_C = 60;
/** Battery charge (%) at or below which the app raises a critical alert. */
export const LOW_SOC = 20;

export const emptyTotals = (): EnergyTotals => ({
  solarWh: 0,
  loadWh: 0,
  gridImportWh: 0,
  gridExportWh: 0,
  batteryChargeWh: 0,
  batteryDischargeWh: 0,
});

/** Trapezoidal integration of power readings (sorted oldest first) into energy. */
export function integrate(readings: readonly Reading[]): EnergyTotals {
  const totals = emptyTotals();
  for (let i = 1; i < readings.length; i += 1) {
    const a = readings[i - 1];
    const b = readings[i];
    if (!a || !b) continue;
    const gap = b.at - a.at;
    if (gap <= 0 || gap > MAX_GAP_MS) continue;
    const hours = gap / 3_600_000;
    const mean = (x: number, y: number) => ((x + y) / 2) * hours;
    totals.solarWh += mean(Math.max(a.solarW, 0), Math.max(b.solarW, 0));
    totals.loadWh += mean(Math.max(a.loadW, 0), Math.max(b.loadW, 0));
    totals.gridImportWh += mean(Math.max(a.gridW, 0), Math.max(b.gridW, 0));
    totals.gridExportWh += mean(Math.max(-a.gridW, 0), Math.max(-b.gridW, 0));
    totals.batteryChargeWh += mean(Math.max(a.batteryW, 0), Math.max(b.batteryW, 0));
    totals.batteryDischargeWh += mean(Math.max(-a.batteryW, 0), Math.max(-b.batteryW, 0));
  }
  return totals;
}

export function sumTotals(items: readonly EnergyTotals[]): EnergyTotals {
  const totals = emptyTotals();
  for (const item of items) {
    totals.solarWh += item.solarWh;
    totals.loadWh += item.loadWh;
    totals.gridImportWh += item.gridImportWh;
    totals.gridExportWh += item.gridExportWh;
    totals.batteryChargeWh += item.batteryChargeWh;
    totals.batteryDischargeWh += item.batteryDischargeWh;
  }
  return totals;
}

/** Share of the consumption that did not come from the grid (0–100), or null without load. */
export function selfSufficiency(totals: EnergyTotals): number | null {
  if (totals.loadWh <= 0) return null;
  return Math.min(100, Math.max(0, (1 - totals.gridImportWh / totals.loadWh) * 100));
}

export type BatteryState = "charging" | "discharging" | "idle";

export const batteryState = (reading: Reading): BatteryState =>
  reading.batteryW > THRESHOLD_W ? "charging" : reading.batteryW < -THRESHOLD_W ? "discharging" : "idle";

export const batteryStateLabel: Record<BatteryState, string> = {
  charging: "تشحن",
  discharging: "تفرغ",
  idle: "ثابتة",
};

export function operatingMode(reading: Reading): string {
  const solar = reading.solarW > THRESHOLD_W;
  const importing = reading.gridW > THRESHOLD_W;
  const exporting = reading.gridW < -THRESHOLD_W;
  const discharging = reading.batteryW < -THRESHOLD_W;
  if (reading.status !== "ONLINE") return "الإنفرتر غير متصل";
  if (importing && !solar && discharging) return "البطارية أولًا";
  if (importing) return "الشبكة تغطي الحمل";
  if (solar && exporting) return "الشمس أولًا • تصدير الفائض";
  if (solar) return "الشمس أولًا";
  if (discharging) return "البطارية تغطي الحمل";
  return "الوضع الحالي غير محدد";
}

/** Alerts that hold right now, derived from the latest reading. */
export function deriveAlerts(latest: Reading, now: number, checkStale: boolean): SystemAlert[] {
  const alerts: SystemAlert[] = [];
  const add = (alert: Omit<SystemAlert, "at">) => alerts.push({ ...alert, at: latest.at });

  if (checkStale && now - latest.at > STALE_AFTER_MS) {
    add({
      id: "stale",
      severity: "warning",
      title: "انقطاع القراءات",
      message: `لم تصل قراءة جديدة منذ ${clockTime(latest.at)}. تحقق من اتصال البوابة بالإنترنت.`,
    });
  }

  if (latest.status === "FAULT") {
    add({ id: "inverter-fault", severity: "critical", title: "عطل في الإنفرتر", message: "أبلغ الإنفرتر عن حالة عطل. راجع شاشة الإنفرتر." });
  } else if (latest.status === "OFFLINE") {
    add({ id: "inverter-offline", severity: "critical", title: "الإنفرتر غير متصل", message: "البوابة لا تستطيع قراءة الإنفرتر." });
  }

  if (latest.soc !== null) {
    const discharging = latest.batteryW < -THRESHOLD_W;
    if (latest.soc <= LOW_SOC) {
      add({
        id: "soc-reserve",
        severity: "critical",
        title: "شحن البطارية منخفض",
        message: `شحن البطارية ${Math.round(latest.soc)}% وهو عند ${LOW_SOC}% أو دونه.`,
      });
    } else if (discharging && latest.soc <= LOW_SOC + 10) {
      add({
        id: "soc-low",
        severity: "warning",
        title: "البطارية تقترب من المستوى المنخفض",
        message: `شحن البطارية ${Math.round(latest.soc)}% وما زالت تفرغ. خفّف الأحمال غير الضرورية.`,
      });
    } else if (latest.soc >= 99 && latest.solarW > THRESHOLD_W) {
      add({
        id: "soc-full",
        severity: "info",
        title: "البطارية ممتلئة والشمس متاحة",
        message: "وقت مناسب لتشغيل الأحمال الثقيلة مثل الغسالة أو سخان الماء.",
      });
    }
  }

  if (latest.tempC !== null && latest.tempC >= HOT_INVERTER_C) {
    add({
      id: "hot-inverter",
      severity: "warning",
      title: "حرارة الإنفرتر مرتفعة",
      message: `حرارة الإنفرتر ${Math.round(latest.tempC)}°C. تأكد من التهوية حوله.`,
    });
  }

  if (latest.gridW > THRESHOLD_W) {
    add({ id: "grid-import", severity: "info", title: "الشبكة تغذي المنزل", message: "جزء من الحمل الحالي يأتي من الشبكة." });
  }

  const order = { critical: 0, warning: 1, info: 2 } as const;
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** State changes found in a series of readings (sorted oldest first), newest first. */
export function deriveEvents(readings: readonly Reading[]): SystemEvent[] {
  const events: SystemEvent[] = [];
  for (let i = 1; i < readings.length; i += 1) {
    const prev = readings[i - 1];
    const cur = readings[i];
    if (!prev || !cur) continue;
    const push = (kind: string, severity: SystemEvent["severity"], title: string) =>
      events.push({ id: `${kind}-${cur.at}`, severity, title, at: cur.at });

    if (prev.status === "ONLINE" && cur.status !== "ONLINE") push("offline", "critical", "انقطع الاتصال بالإنفرتر");
    if (prev.status !== "ONLINE" && cur.status === "ONLINE") push("online", "info", "عاد الاتصال بالإنفرتر");

    const wasImporting = prev.gridW > THRESHOLD_W;
    const isImporting = cur.gridW > THRESHOLD_W;
    if (!wasImporting && isImporting) push("grid-on", "info", "بدأ السحب من الشبكة");
    if (wasImporting && !isImporting) push("grid-off", "info", "توقف السحب من الشبكة");

    const wasSolar = prev.solarW > THRESHOLD_W;
    const isSolar = cur.solarW > THRESHOLD_W;
    if (!wasSolar && isSolar) push("solar-on", "info", "بدأ الإنتاج الشمسي");
    if (wasSolar && !isSolar) push("solar-off", "info", "توقف الإنتاج الشمسي");

    if (prev.soc !== null && cur.soc !== null) {
      if (prev.soc > LOW_SOC && cur.soc <= LOW_SOC) push("reserve", "critical", `انخفض شحن البطارية إلى ${LOW_SOC}%`);
      if (prev.soc < 99.5 && cur.soc >= 99.5) push("full", "info", "اكتمل شحن البطارية");
    }
  }
  return events.reverse();
}
