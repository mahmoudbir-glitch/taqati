export type GatewayStatus = "PENDING" | "ONLINE" | "OFFLINE" | "DISABLED";
export type InverterStatus = "ONLINE" | "OFFLINE" | "FAULT" | "UNKNOWN";

export interface TelemetryReading {
  schemaVersion: 1;
  timestamp: string;
  gatewayId: string;
  siteId: string;
  inverterId?: string;
  inverter: {
    status: InverterStatus;
    solarPowerW: number;
    loadPowerW: number;
    gridPowerW: number;
    temperatureC?: number;
  };
  battery: {
    soc: number;
    voltage: number;
    current: number;
    powerW: number;
    direction: "charging" | "discharging" | "idle";
  };
}

export const telemetryTopic = (siteId: string, gatewayId: string) =>
  `taqati/v1/sites/${siteId}/gateways/${gatewayId}/telemetry`;
