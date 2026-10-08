import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import mqtt, { MqttClient } from "mqtt";
import { Prisma, prisma } from "@taqati/database";
import { BatteryDirection, isTelemetryMessage, TaqatiTelemetryMessage } from "@taqati/shared";

const DAY_MS = 24 * 3_600_000;

// Battery power/current are stored signed: positive charging, negative discharging.
// Rows written before that rule hold the magnitude only, with the direction kept in
// `rawData`, so every reader goes through these expressions.
const BATTERY_POWER_SQL = Prisma.sql`(CASE WHEN "rawData"->'battery'->>'direction' = 'discharging' THEN -ABS("batteryPowerW") ELSE "batteryPowerW" END)`;
const BATTERY_CURRENT_SQL = Prisma.sql`(CASE WHEN "rawData"->'battery'->>'direction' = 'discharging' THEN -ABS("batteryCurrent") ELSE "batteryCurrent" END)`;

// `recordedAt` is a UTC `timestamp`; comparing it with a plain UTC literal keeps
// the result independent of the database session time zone.
const utcTimestamp = (date: Date) => date.toISOString().replace("T", " ").replace("Z", "");

export interface ProvisionTarget {
  siteId: string;
  gatewayId: string;
  serialNumber: string;
  siteName: string;
  gatewayName: string;
  model?: string;
}

@Injectable()
export class TelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryService.name);
  private client?: MqttClient;
  private readonly provisioned = new Set<string>();

  async onModuleInit() {
    const url = process.env.MQTT_URL;
    if (!url) {
      this.logger.warn("MQTT_URL is not configured; telemetry ingestion is disabled");
      return;
    }

    this.client = mqtt.connect(url, {
      // An empty value in .env means "no credentials", not an empty username.
      username: process.env.MQTT_USERNAME || undefined,
      password: process.env.MQTT_PASSWORD || undefined,
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

    try {
      if (process.env.AUTO_PROVISION_GATEWAYS === "true") {
        await this.ensureSiteAndGateway({ siteId, gatewayId, serialNumber: gatewayId, siteName: siteId, gatewayName: gatewayId });
      }
      if (parts[6] === "status") await this.handleStatus(siteId, gatewayId, payload);
      else if (parts[6] === "telemetry") await this.handleTelemetry(siteId, gatewayId, payload);
    } catch (error) {
      this.logger.warn(`Failed to handle ${parts[6]} from ${gatewayId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Creates the organization/site/gateway rows that telemetry rows reference.
   * MQTT gateways only get this in development (AUTO_PROVISION_GATEWAYS=true);
   * in production a gateway must be registered before its telemetry is stored.
   */
  async ensureSiteAndGateway(target: ProvisionTarget) {
    const key = `${target.siteId}/${target.gatewayId}`;
    if (this.provisioned.has(key)) return;

    const organization = await prisma.organization.upsert({
      where: { slug: "taqati-default" },
      update: {},
      create: { name: "Taqati", slug: "taqati-default" },
    });
    await prisma.site.upsert({
      where: { id: target.siteId },
      update: {},
      create: { id: target.siteId, organizationId: organization.id, name: target.siteName },
    });
    await prisma.gateway.upsert({
      where: { id: target.gatewayId },
      update: {},
      create: {
        id: target.gatewayId,
        siteId: target.siteId,
        serialNumber: target.serialNumber,
        name: target.gatewayName,
        model: target.model,
      },
    });
    this.provisioned.add(key);
  }

  private async handleStatus(siteId: string, gatewayId: string, payload: string) {
    let data: { status?: string; timestamp?: string; latencyMs?: number; ip?: string };
    try {
      data = JSON.parse(payload) as typeof data;
    } catch {
      this.logger.warn(`Rejected invalid status payload from ${gatewayId}`);
      return;
    }
    const status = data.status === "ONLINE" ? "ONLINE" : data.status === "DISABLED" ? "DISABLED" : "OFFLINE";
    const reportedAt = data.timestamp ? new Date(data.timestamp) : new Date();
    const at = Number.isNaN(reportedAt.getTime()) ? new Date() : reportedAt;
    await prisma.gateway.updateMany({
      where: { id: gatewayId, siteId },
      data: {
        status,
        // An OFFLINE report (usually the broker's Last Will) is not a sign of life.
        ...(status === "ONLINE" ? { lastSeenAt: at, connectedAt: at } : { disconnectedAt: at }),
        lastMqttAt: new Date(),
        latencyMs: typeof data.latencyMs === "number" ? Math.max(0, Math.round(data.latencyMs)) : undefined,
        lastIp: typeof data.ip === "string" ? data.ip : undefined,
      },
    });
  }

  private async handleTelemetry(siteId: string, gatewayId: string, payload: string) {
    let data: unknown;
    try {
      data = JSON.parse(payload);
    } catch {
      data = undefined;
    }
    if (!isTelemetryMessage(data)) {
      this.logger.warn(`Rejected invalid telemetry from ${gatewayId}`);
      return;
    }
    await this.persistTelemetry(siteId, gatewayId, data);
  }

  async persistTelemetry(siteId: string, gatewayId: string, data: TaqatiTelemetryMessage) {
    const inverterId = data.meta?.inverterId;
    const recordedAt = new Date(data.timestamp);
    if (Number.isNaN(recordedAt.getTime())) return;
    const direction = data.battery?.direction;

    await prisma.$transaction([
      prisma.telemetryReading.create({
        data: {
          siteId,
          gatewayId,
          inverterId,
          recordedAt,
          solarPowerW: wattsOrNull(data.inverter.solarPowerW),
          loadPowerW: wattsOrNull(data.inverter.loadPowerW),
          gridPowerW: wattsOrNull(data.inverter.gridPowerW),
          batterySoc: numberOrNull(data.battery?.soc),
          batteryVoltage: numberOrNull(data.battery?.voltageV),
          batteryCurrent: signedByDirection(numberOrNull(data.battery?.currentA), direction),
          batteryPowerW: signedByDirection(wattsOrNull(data.battery?.powerW), direction),
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

  /** Newest readings first. Battery power and current are signed (positive charging). */
  async latest(siteId: string, limit = 60) {
    const rows = await prisma.telemetryReading.findMany({
      where: { siteId },
      orderBy: { recordedAt: "desc" },
      take: Math.min(Math.max(limit, 1), 300),
    });

    return rows.map(({ rawData, ...row }) => {
      const direction = storedDirection(rawData);
      return {
        ...row,
        id: row.id.toString(),
        batteryPowerW: signedByDirection(row.batteryPowerW, direction),
        batteryCurrent: signedByDirection(row.batteryCurrent === null ? null : Number(row.batteryCurrent), direction),
      };
    });
  }

  /**
   * Readings averaged into fixed time buckets, oldest first. This is what charts
   * use: its size depends on the window, not on how often the gateway reports.
   */
  async series(siteId: string, sinceMs?: number, bucketMinutes = 5): Promise<SeriesRow[]> {
    const now = Date.now();
    const earliest = now - 2 * DAY_MS;
    const since = new Date(Math.min(Math.max(sinceMs ?? now - DAY_MS, earliest), now));
    const bucketSeconds = Math.min(Math.max(Math.round(bucketMinutes), 1), 60) * 60;

    return prisma.$queryRaw<SeriesRow[]>`
      SELECT
        (floor(extract(epoch FROM "recordedAt") / ${bucketSeconds}::int) * ${bucketSeconds}::int * 1000)::float8 AS "at",
        AVG("solarPowerW")::float8 AS "solarPowerW",
        AVG("loadPowerW")::float8 AS "loadPowerW",
        AVG("gridPowerW")::float8 AS "gridPowerW",
        AVG(${BATTERY_POWER_SQL})::float8 AS "batteryPowerW",
        AVG("batterySoc")::float8 AS "batterySoc",
        AVG("batteryVoltage")::float8 AS "batteryVoltage",
        AVG(${BATTERY_CURRENT_SQL})::float8 AS "batteryCurrent",
        AVG("inverterTemperature")::float8 AS "inverterTemperature",
        AVG("gridVoltage")::float8 AS "gridVoltage",
        AVG("gridFrequency")::float8 AS "gridFrequency",
        (array_agg("inverterStatus"::text ORDER BY "recordedAt" DESC))[1] AS "inverterStatus"
      FROM "TelemetryReading"
      WHERE "siteId" = ${siteId} AND "recordedAt" >= ${utcTimestamp(since)}::timestamp
      GROUP BY 1
      ORDER BY 1
    `;
  }

  /**
   * Energy totals per local calendar day (site timezone), oldest first.
   * Each 5-minute bucket that has readings contributes its mean power for 5
   * minutes, so the result neither depends on how often the gateway reports nor
   * invents energy for periods without readings.
   */
  async daily(siteId: string, days = 30): Promise<DailyEnergyRow[]> {
    const span = Math.min(Math.max(days, 1), 90);
    const site = await prisma.site.findUnique({ where: { id: siteId }, select: { timezone: true } });
    const timezone = site?.timezone ?? "UTC";
    const since = new Date(Date.now() - span * DAY_MS);

    // `hours` is the bucket length; the bucket still in progress counts for its elapsed part.
    return prisma.$queryRaw<DailyEnergyRow[]>`
      SELECT
        to_char(b.bucket AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS "date",
        SUM(b.solar * b.hours)::float8 AS "solarWh",
        SUM(b.load * b.hours)::float8 AS "loadWh",
        SUM(b.grid_import * b.hours)::float8 AS "gridImportWh",
        SUM(b.grid_export * b.hours)::float8 AS "gridExportWh",
        SUM(b.battery_charge * b.hours)::float8 AS "batteryChargeWh",
        SUM(b.battery_discharge * b.hours)::float8 AS "batteryDischargeWh"
      FROM (
        SELECT
          r.bucket,
          LEAST(300, GREATEST(0, EXTRACT(EPOCH FROM (now() - r.bucket)))) / 3600.0 AS hours,
          r.solar, r.load, r.grid_import, r.grid_export, r.battery_charge, r.battery_discharge
        FROM (
          SELECT
            to_timestamp(floor(extract(epoch FROM "recordedAt") / 300) * 300) AS bucket,
            AVG(GREATEST(COALESCE("solarPowerW", 0), 0)) AS solar,
            AVG(GREATEST(COALESCE("loadPowerW", 0), 0)) AS load,
            AVG(GREATEST(COALESCE("gridPowerW", 0), 0)) AS grid_import,
            AVG(GREATEST(-COALESCE("gridPowerW", 0), 0)) AS grid_export,
            AVG(GREATEST(COALESCE(${BATTERY_POWER_SQL}, 0), 0)) AS battery_charge,
            AVG(GREATEST(-COALESCE(${BATTERY_POWER_SQL}, 0), 0)) AS battery_discharge
          FROM "TelemetryReading"
          WHERE "siteId" = ${siteId} AND "recordedAt" >= ${utcTimestamp(since)}::timestamp
          GROUP BY 1
        ) r
      ) b
      GROUP BY 1
      ORDER BY 1
    `;
  }
}

export interface SeriesRow {
  /** Bucket start, epoch milliseconds. */
  at: number;
  solarPowerW: number | null;
  loadPowerW: number | null;
  gridPowerW: number | null;
  batteryPowerW: number | null;
  batterySoc: number | null;
  batteryVoltage: number | null;
  batteryCurrent: number | null;
  inverterTemperature: number | null;
  gridVoltage: number | null;
  gridFrequency: number | null;
  inverterStatus: string;
}

export interface DailyEnergyRow {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  solarWh: number;
  loadWh: number;
  gridImportWh: number;
  gridExportWh: number;
  batteryChargeWh: number;
  batteryDischargeWh: number;
}

function numberOrNull(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Power columns are integers; a fractional watt value would be rejected by the database.
function wattsOrNull(value: number | undefined) {
  const numeric = numberOrNull(value);
  return numeric === null ? null : Math.round(numeric);
}

/** The contract sends battery magnitudes plus a direction; storage is signed. */
function signedByDirection(value: number | null, direction: BatteryDirection | undefined) {
  if (value === null) return null;
  if (direction === "discharging") return -Math.abs(value);
  if (direction === "charging") return Math.abs(value);
  return value;
}

function storedDirection(rawData: unknown): BatteryDirection | undefined {
  const battery = rawData && typeof rawData === "object" ? (rawData as { battery?: { direction?: unknown } }).battery : undefined;
  const direction = battery?.direction;
  return direction === "charging" || direction === "discharging" || direction === "idle" || direction === "unknown" ? direction : undefined;
}

function mapInverterStatus(value: string) {
  if (value === "online") return "ONLINE" as const;
  if (value === "offline") return "OFFLINE" as const;
  if (value === "fault") return "FAULT" as const;
  return "UNKNOWN" as const;
}
