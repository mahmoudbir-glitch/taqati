export const MQTT_TOPICS = {
  telemetry: (siteId: string, gatewayId: string) =>
    `taqati/v1/sites/${siteId}/gateways/${gatewayId}/telemetry`,
  status: (siteId: string, gatewayId: string) =>
    `taqati/v1/sites/${siteId}/gateways/${gatewayId}/status`,
  commands: (siteId: string, gatewayId: string) =>
    `taqati/v1/sites/${siteId}/gateways/${gatewayId}/commands`,
  ack: (siteId: string, gatewayId: string) =>
    `taqati/v1/sites/${siteId}/gateways/${gatewayId}/ack`,
} as const;

export type TelemetryStatus = "online" | "offline" | "fault" | "unknown";
export type BatteryDirection = "charging" | "discharging" | "idle" | "unknown";

export interface TaqatiTelemetryMessage {
  schemaVersion: 1;
  timestamp: string;
  inverter: {
    status: TelemetryStatus;
    solarPowerW?: number;
    loadPowerW?: number;
    gridPowerW?: number;
    temperatureC?: number;
    gridVoltageV?: number;
    gridFrequencyHz?: number;
  };
  battery?: {
    soc?: number;
    voltageV?: number;
    currentA?: number;
    powerW?: number;
    direction?: BatteryDirection;
  };
  meta?: {
    inverterId?: string;
    sequence?: number;
    /** Where the reading came from, e.g. "gateway" or "smartess-cloud". */
    source?: string;
    /** Vendor values that have no first-class field yet (kept in raw data). */
    extra?: Record<string, number>;
  };
}

export function isTelemetryMessage(value: unknown): value is TaqatiTelemetryMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  const inverter = message.inverter;
  return (
    message.schemaVersion === 1 &&
    typeof message.timestamp === "string" &&
    !!inverter &&
    typeof inverter === "object" &&
    typeof (inverter as Record<string, unknown>).status === "string"
  );
}
