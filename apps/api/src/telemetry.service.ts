import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import mqtt, { MqttClient } from "mqtt";
import { prisma } from "@taqati/database";
import { isTelemetryMessage, TaqatiTelemetryMessage } from "@taqati/shared";

@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private client?: MqttClient;

  async onModuleInit() {
    const url = process.env.MQTT_URL;
    if (!url) {
      this.logger.warn("MQTT_URL is not configured; telemetry ingestion is disabled");
      return;
    }

    this.client = mqtt.connect(url, {
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      reconnectPeriod: 5000,
      clean: true,
    });

    this.client.on("connect", () => {
      this.logger.log("Connected to MQTT broker");
      this.client?.subscribe("taqati/v1/sites/+/gateways/+/telemetry", { qos: 1 });
      this.client?.subscribe("taqati/v1/sites/+/gateways/+/status", { qos: 1 });
    });

    this.client.on("message", (topic, payload) => {
      void this.handleMessage(topic, payload.toString());
    });

    this.client.on("error", (error) => this.logger.error(error.message));
  }

  async onModuleDestroy() {
    this.client?.end(true);
    await prisma.$disconnect();
  }

  private async handleMessage(topic: string, payload: string) {
    const parts = topic.split("/");
    if (
      parts.length !== 7 ||
      parts[0] !== "taqati" ||
      parts[1] !== "v1" ||
      parts[2] !== "sites" ||
      parts[4] !== "gateways"
    ) return;

    const siteId = parts[3];
    const gatewayId = parts[5];
    if (!siteId || !gatewayId) return;

    if (parts[6] === "status") {
      await this.handleStatus(siteId, gatewayId, payload);
      return;
    }

    if (parts[6] === "telemetry") {
      await this.handleTelemetry(siteId, gatewayId, payload);
    }
  }

  private async handleStatus(siteId: string, gatewayId: string, payload: string) {
    try {
      const data = JSON.parse(payload) as { status?: string; timestamp?: string; latencyMs?: number; ip?: string };
      const status = data.status === "ONLINE" ? "ONLINE" : data.status === "DISABLED" ? "DISABLED" : "OFFLINE";
      await prisma.gateway.updateMany({
        where: { id: gatewayId, siteId },
        data: {
          status,
          lastSeenAt: data.timestamp ? new Date(data.timestamp) : new Date(),
          lastMqttAt: new Date(),
          latencyMs: typeof data.latencyMs === "number" ? Math.max(0, Math.round(data.latencyMs)) : undefined,
          lastIp: typeof data.ip === "string" ? data.ip : undefined,
        },
      });
    } catch (error) {
      this.logger.warn(`Invalid gateway status payload: ${String(error)}`);
    }
  }

  private async handleTelemetry(siteId: string, gatewayId: string, payload: string) {
    try {
      const data: unknown = JSON.parse(payload);
      if (!isTelemetryMessage(data)) {
        this.logger.warn(`Rejected invalid telemetry from ${gatewayId}`);
        return;
      }
      await this.persistTelemetry(siteId, gatewayId, data);
    } catch (error) {
      this.logger.warn(`Invalid telemetry payload: ${String(error)}`);
    }
  }

  private async persistTelemetry(siteId: string, gatewayId: string, data: TaqatiTelemetryMessage) {
    const inverterId = data.meta?.inverterId;
    const recordedAt = new Date(data.timestamp);
    if (Number.isNaN(recordedAt.getTime())) return;

    await prisma.$transaction([
      prisma.telemetryReading.create({
        data: {
          siteId,
          gatewayId,
          inverterId,
          recordedAt,
          solarPowerW: numberOrNull(data.inverter.solarPowerW),
          loadPowerW: numberOrNull(data.inverter.loadPowerW),
          gridPowerW: numberOrNull(data.inverter.gridPowerW),
          batterySoc: numberOrNull(data.battery?.soc),
          batteryVoltage: numberOrNull(data.battery?.voltageV),
          batteryCurrent: numberOrNull(data.battery?.currentA),
          batteryPowerW: numberOrNull(data.battery?.powerW),
          inverterTemperature: numberOrNull(data.inverter.temperatureC),
          gridVoltage: numberOrNull(data.inverter.gridVoltageV),
          gridFrequency: numberOrNull(data.inverter.gridFrequencyHz),
          inverterStatus: mapInverterStatus(data.inverter.status),
          rawData: JSON.parse(JSON.stringify(data)),
        },
      }),
      prisma.gateway.updateMany({
        where: { id: gatewayId, siteId },
        data: {
          status: "ONLINE",
          lastSeenAt: new Date(),
          lastTelemetryAt: recordedAt,
          lastMqttAt: new Date(),
          lastInverterReadAt: recordedAt,
        },
      }),
      ...(inverterId
        ? [prisma.inverter.updateMany({
            where: { id: inverterId, siteId, gatewayId },
            data: { status: mapInverterStatus(data.inverter.status), lastSeenAt: recordedAt },
          })]
        : []),
    ]);
  }

  async latest(siteId: string, limit = 60) {
    const rows = await prisma.telemetryReading.findMany({
      where: { siteId },
      orderBy: { recordedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 300),
    });

    return rows.map((row) => ({ ...row, id: row.id.toString() }));
  }
}

function numberOrNull(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapInverterStatus(value: string) {
  if (value === "online") return "ONLINE" as const;
  if (value === "offline") return "OFFLINE" as const;
  if (value === "fault") return "FAULT" as const;
  return "UNKNOWN" as const;
}
