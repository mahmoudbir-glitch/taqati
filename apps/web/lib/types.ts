export type InverterStatus = "ONLINE" | "OFFLINE" | "FAULT" | "UNKNOWN";

type ApiNumber = number | string | null | undefined;

/** A telemetry row as returned by `GET /api/sites/:siteId/telemetry/latest`. */
export type ApiTelemetry = {
  id: string;
  recordedAt: string;
  gatewayId?: string | null;
  inverterId?: string | null;
  solarPowerW: ApiNumber;
  loadPowerW: ApiNumber;
  gridPowerW: ApiNumber;
  batterySoc: ApiNumber;
  batteryVoltage?: ApiNumber;
  batteryCurrent?: ApiNumber;
  batteryPowerW: ApiNumber;
  inverterTemperature?: ApiNumber;
  gridVoltage?: ApiNumber;
  gridFrequency?: ApiNumber;
  inverterStatus: string;
};

/**
 * A normalized reading used across the UI.
 * Sign convention: `batteryW` > 0 is charging, `gridW` > 0 is importing.
 */
export type Reading = {
  id: string;
  at: number;
  solarW: number;
  loadW: number;
  gridW: number;
  batteryW: number;
  soc: number | null;
  batteryV: number | null;
  batteryA: number | null;
  gridV: number | null;
  gridHz: number | null;
  tempC: number | null;
  status: InverterStatus;
  gatewayId: string | null;
  inverterId: string | null;
};

export type EnergyTotals = {
  solarWh: number;
  loadWh: number;
  gridImportWh: number;
  gridExportWh: number;
  batteryChargeWh: number;
  batteryDischargeWh: number;
};

/** Energy totals for one local calendar day (`date` is YYYY-MM-DD). */
export type DailyEnergy = EnergyTotals & { date: string };

/** "locked": a backend exists but the visitor has not signed in yet. */
export type DataMode = "demo" | "live" | "error" | "locked";

export type AlertSeverity = "critical" | "warning" | "info";

export type SystemAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  at: number;
};

export type SystemEvent = {
  id: string;
  severity: AlertSeverity;
  title: string;
  at: number;
};
