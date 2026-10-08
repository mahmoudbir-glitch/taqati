import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { prisma } from "@taqati/database";
import { TelemetryService } from "../telemetry.service";
import { deviceFromSn, sha1, SmartessClient, SmartessConfig } from "./smartess.client";
import { hasHeadlineData, mapLastData } from "./smartess.mapper";

const REQUIRED = ["SMARTESS_USERNAME", "SMARTESS_DEVICE_PN", "SMARTESS_DEVICE_SN"] as const;

// Public client key used by the SmartESS web app (same default as the Solar project).
const DEFAULT_COMPANY_KEY = "bnrl_frRFjEz8Mkn";

interface PollerSettings {
  client: SmartessConfig;
  siteId: string;
  gatewayId: string;
  intervalMs: number;
  timezoneOffset: string;
}

function loadSettings(logger: Logger): PollerSettings | null {
  const env = process.env;
  if (env.SMARTESS_ENABLED !== "true") {
    logger.log("SmartESS polling is disabled (set SMARTESS_ENABLED=true to enable)");
    return null;
  }

  const missing: string[] = REQUIRED.filter((name) => !env[name]);
  const passwordSha1 = env.SMARTESS_PASSWORD_SHA1 || (env.SMARTESS_PASSWORD ? sha1(env.SMARTESS_PASSWORD) : "");
  if (!passwordSha1) missing.push("SMARTESS_PASSWORD (or SMARTESS_PASSWORD_SHA1)");
  if (missing.length > 0) {
    logger.error(`SmartESS polling not started, missing: ${missing.join(", ")}`);
    return null;
  }

  // The SN is PN + devcode (4 hex) + devaddr (2 hex); explicit values override it.
  const derived = deviceFromSn(env.SMARTESS_DEVICE_PN as string, env.SMARTESS_DEVICE_SN as string);
  const devcode = env.SMARTESS_DEVICE_DEVCODE ? Number(env.SMARTESS_DEVICE_DEVCODE) : derived?.devcode;
  const devaddr = env.SMARTESS_DEVICE_DEVADDR ? Number(env.SMARTESS_DEVICE_DEVADDR) : derived?.devaddr;
  if (devcode === undefined || devaddr === undefined || !Number.isFinite(devcode) || !Number.isFinite(devaddr)) {
    logger.error(
      "SmartESS polling not started: SMARTESS_DEVICE_SN must be PN + 6 hex digits, or set SMARTESS_DEVICE_DEVCODE and SMARTESS_DEVICE_DEVADDR",
    );
    return null;
  }

  const intervalSeconds = Number(env.SMARTESS_POLL_INTERVAL_SECONDS ?? 300);
  return {
    client: {
      baseUrl: env.SMARTESS_API_BASE || "https://api.dessmonitor.com/public/",
      authAction: env.SMARTESS_AUTH_ACTION || undefined,
      username: env.SMARTESS_USERNAME as string,
      passwordSha1,
      companyKey: env.SMARTESS_COMPANY_KEY || DEFAULT_COMPANY_KEY,
      source: env.SMARTESS_SOURCE || "1",
      device: {
        pn: env.SMARTESS_DEVICE_PN as string,
        sn: env.SMARTESS_DEVICE_SN as string,
        devcode,
        devaddr,
      },
    },
    siteId: env.SITE_ID || "development-site",
    gatewayId: env.GATEWAY_ID || "smartess-cloud",
    // The collector reports every 5 minutes; polling faster only wastes API calls.
    intervalMs: Math.max(60, Number.isFinite(intervalSeconds) ? intervalSeconds : 300) * 1000,
    timezoneOffset: env.SMARTESS_TIMEZONE_OFFSET || "+03:00",
  };
}

@Injectable()
export class SmartessPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmartessPoller.name);
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private failures = 0;
  private lastTimestamp?: string;

  constructor(@Inject(TelemetryService) private readonly telemetry: TelemetryService) {}

  async onModuleInit() {
    const settings = loadSettings(this.logger);
    if (!settings) return;

    try {
      await this.telemetry.ensureSiteAndGateway({
        siteId: settings.siteId,
        gatewayId: settings.gatewayId,
        serialNumber: settings.client.device.pn,
        siteName: "SmartESS site",
        gatewayName: "SmartESS cloud",
        model: "Wi-Fi Plug Pro RTU",
      });
    } catch (error) {
      this.logger.error(`SmartESS bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const client = new SmartessClient(settings.client);
    this.logger.log(`SmartESS polling every ${settings.intervalMs / 1000}s for site ${settings.siteId}`);
    const loop = async () => {
      await this.pollOnce(client, settings);
      if (!this.stopped) this.timer = setTimeout(loop, settings.intervalMs);
    };
    void loop();
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private async pollOnce(client: SmartessClient, settings: PollerSettings) {
    try {
      const data = await client.fetchLastData(hasHeadlineData);
      const message = mapLastData(data, { timezoneOffset: settings.timezoneOffset });
      if (!message) {
        this.logger.warn("SmartESS returned no recognizable parameters");
        return;
      }
      this.failures = 0;
      // The collector only refreshes every few minutes; skip readings we already stored.
      if (message.timestamp === this.lastTimestamp) return;
      await this.telemetry.persistTelemetry(settings.siteId, settings.gatewayId, message);
      this.lastTimestamp = message.timestamp;
    } catch (error) {
      this.failures += 1;
      this.logger.warn(`SmartESS poll failed (${this.failures}): ${error instanceof Error ? error.message : String(error)}`);
      if (this.failures === 3) {
        await prisma.gateway
          .updateMany({ where: { id: settings.gatewayId, siteId: settings.siteId }, data: { status: "OFFLINE" } })
          .catch(() => undefined);
      }
    }
  }
}
