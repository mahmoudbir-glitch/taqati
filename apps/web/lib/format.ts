// Latin digits inside Arabic text keep numbers and units readable ("4.82 kW").
const LOCALE = "ar-u-nu-latn";

const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short" });
const shortDayFormat = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "numeric" });
const relativeFormat = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

export const THRESHOLD_W = 50; // watts below which a flow is considered idle

export const kw = (watts: number) => `${(Math.abs(watts) / 1000).toFixed(2)} kW`;

export const power = (watts: number) => {
  const abs = Math.abs(watts);
  return abs >= 1000 ? `${(abs / 1000).toFixed(2)} kW` : `${Math.round(abs)} W`;
};

export const kwh = (wh: number) => {
  const value = Math.abs(wh) / 1000;
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} kWh`;
};

export const amps = (value: number) => `${Math.abs(value).toFixed(1)} A`;
export const volts = (value: number) => `${value.toFixed(1)} V`;
export const percent = (value: number) => `${Math.round(value)}%`;

export const clockTime = (at: number) => timeFormat.format(at);
export const dateTime = (at: number) => dateTimeFormat.format(at);

/** Formats a YYYY-MM-DD day key. */
export const dayLabel = (date: string) => dayFormat.format(parseDayKey(date));
export const shortDayLabel = (date: string) => shortDayFormat.format(parseDayKey(date));

export const relativeTime = (at: number, now: number) => {
  const seconds = Math.round((at - now) / 1000);
  if (Math.abs(seconds) < 45) return "الآن";
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relativeFormat.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeFormat.format(hours, "hour");
  return relativeFormat.format(Math.round(hours / 24), "day");
};

export const startOfDay = (at: number) => {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export const dayKey = (at: number) => {
  const date = new Date(at);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

function parseDayKey(date: string) {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}
