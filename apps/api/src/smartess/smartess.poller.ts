import { BadRequestException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { prisma } from "@taqati/database";
import { adminEnabled } from "../admin-auth";
import { TelemetryService } from "../telemetry.service";
import { deviceFromSn, sha1, SmartessClient, SmartessConfig } from "./smartess.client";
import { decryptSecret, encryptSecret } from "./smartess.crypto";
import { hasHeadlineData, mapLastData } from "./smartess.mapper";

// Public client key used by the SmartESS web app (same default as the Solar project).
const DEFAULT_COMPANY_KEY = "bnrl_frRFjEz8Mkn";

type Source = "database" | "environment";

interface PollerSettings {
  source: Source;
  client: SmartessConfig;
  siteId: string;
  gatewayId: string;
  intervalMs: number;
  timezoneOffset: string;
}

interface Account {
  username: string;
  passwordSha1: string;
  devicePn: string;
  deviceSn: string;
  /** Known when the device was found on the account; otherwise derived from the SN. */
  devcode?: number;
  devaddr?: number;
}

interface Runner {
  settings: PollerSettings;
  client: SmartessClient;
  timer?: NodeJS.Timeout;
  stopped: boolean;
  failures: number;
  lastTimestamp?: string;
  lastPollAt?: Date;
  lastSuccessAt?: Date;
  lastError?: string;
}

export interface SmartessInput {
  username?: unknown;
  password?: unknown;
  devicePn?: unknown;
  deviceSn?: unknown;
  enabled?: unknown;
}

export interface SmartessStatus {
  /** Where the active account comes from; "none" when SmartESS is not set up. */
  source: Source | "none";
  enabled: boolean;
  /** Identifiers are masked: this endpoint is readable without the admin token. */
  username: string | null;
  devicePn: string | null;
  deviceSn: string | null;
  polling: boolean;
  lastPollAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  /** False when the server has no ADMIN_TOKEN, so nothing can be saved. */
  canEdit: boolean;
}

const envSiteId = () => process.env.SITE_ID || "development-site";

const maskTail = (value: string) => (value.length <= 4 ? "••••" : `••••${value.slice(-4)}`);
const maskHead = (value: string) => (value.length <= 2 ? "••••" : `${value.slice(0, 2)}••••`);

const blank = (value: unknown) => value === undefined || value === null || (typeof value === "string" && !value.trim());

/** Connection settings that do not depend on a device. */
function accountClient(username: string, passwordSha1: string): SmartessConfig {
  const env = process.env;
  return {
    baseUrl: env.SMARTESS_API_BASE || "https://api.dessmonitor.com/public/",
    authAction: env.SMARTESS_AUTH_ACTION || undefined,
    username,
    passwordSha1,
    companyKey: env.SMARTESS_COMPANY_KEY || DEFAULT_COMPANY_KEY,
    source: env.SMARTESS_SOURCE || "1",
  };
}

function buildSettings(source: Source, siteId: string, account: Account): PollerSettings {
  const env = process.env;
  // Explicit values win. Some SNs are PN + devcode (4 hex) + devaddr (2 hex) and
  // can be split; others (e.g. "DEV1A10…") carry no address at all.
  const derived = deviceFromSn(account.devicePn, account.deviceSn);
  const devcode = account.devcode ?? derived?.devcode;
  const devaddr = account.devaddr ?? derived?.devaddr;
  if (devcode === undefined || devaddr === undefined || !Number.isFinite(devcode) || !Number.isFinite(devaddr)) {
    throw new Error("the device code and address are unknown for this SN");
  }

  const intervalSeconds = Number(env.SMARTESS_POLL_INTERVAL_SECONDS ?? 300);
  return {
    source,
    client: {
      ...accountClient(account.username, account.passwordSha1),
      device: { pn: account.devicePn.trim(), sn: account.deviceSn.trim(), devcode, devaddr },
    },
    siteId,
    // Gateway ids are global, so every site polled from the cloud gets its own.
    gatewayId: siteId === envSiteId() ? env.GATEWAY_ID || "smartess-cloud" : `smartess-${siteId}`,
    // The collector reports every 5 minutes; polling faster only wastes API calls.
    intervalMs: Math.max(60, Number.isFinite(intervalSeconds) ? intervalSeconds : 300) * 1000,
    timezoneOffset: env.SMARTESS_TIMEZONE_OFFSET || "+03:00",
  };
}

/** The account from SMARTESS_* variables, or null when they are off or incomplete. */
function envAccount(logger?: Logger): Account | null {
  const env = process.env;
  if (env.SMARTESS_ENABLED !== "true") return null;
  const passwordSha1 = env.SMARTESS_PASSWORD_SHA1 || (env.SMARTESS_PASSWORD ? sha1(env.SMARTESS_PASSWORD) : "");
  const missing = (["SMARTESS_USERNAME", "SMARTESS_DEVICE_PN", "SMARTESS_DEVICE_SN"] as const).filter((name) => !env[name]) as string[];
  if (!passwordSha1) missing.push("SMARTESS_PASSWORD (or SMARTESS_PASSWORD_SHA1)");
  if (missing.length > 0) {
    logger?.error(`SmartESS environment account ignored, missing: ${missing.join(", ")}`);
    return null;
  }
  return {
    username: env.SMARTESS_USERNAME as string,
    passwordSha1,
    devicePn: env.SMARTESS_DEVICE_PN as string,
    deviceSn: env.SMARTESS_DEVICE_SN as string,
    devcode: env.SMARTESS_DEVICE_DEVCODE ? Number(env.SMARTESS_DEVICE_DEVCODE) : undefined,
    devaddr: env.SMARTESS_DEVICE_DEVADDR ? Number(env.SMARTESS_DEVICE_DEVADDR) : undefined,
  };
}

const text = (value: unknown, label: string, pattern?: RegExp) => {
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${label} is required`);
  const clean = value.trim();
  if (clean.length > 120 || (pattern && !pattern.test(clean))) throw new BadRequestException(`${label} is not valid`);
  return clean;
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

@Injectable()
export class SmartessPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmartessPoller.name);
  private readonly runners = new Map<string, Runner>();

  constructor(@Inject(TelemetryService) private readonly telemetry: TelemetryService) {}

  async onModuleInit() {
    try {
      const saved = await prisma.smartessConnection.findMany({ select: { siteId: true } });
      const sites = new Set(saved.map((row) => row.siteId));
      if (envAccount(this.logger)) sites.add(envSiteId());
      if (sites.size === 0) this.logger.log("SmartESS polling is not configured");
      for (const siteId of sites) await this.reload(siteId);
    } catch (error) {
      this.logger.error(`SmartESS bootstrap failed: ${message(error)}`);
    }
  }

  onModuleDestroy() {
    for (const siteId of [...this.runners.keys()]) this.stop(siteId);
  }

  async status(siteId: string): Promise<SmartessStatus> {
    const saved = await prisma.smartessConnection.findUnique({ where: { siteId } });
    const fallback = !saved && siteId === envSiteId() ? envAccount() : null;
    const account = saved ?? fallback;
    const runner = this.runners.get(siteId);
    return {
      source: saved ? "database" : fallback ? "environment" : "none",
      enabled: saved ? saved.enabled : Boolean(fallback),
      username: account ? maskHead(account.username) : null,
      devicePn: account ? maskTail(account.devicePn) : null,
      deviceSn: account ? maskTail(account.deviceSn) : null,
      polling: Boolean(runner),
      lastPollAt: runner?.lastPollAt?.toISOString() ?? null,
      lastSuccessAt: runner?.lastSuccessAt?.toISOString() ?? null,
      lastError: runner?.lastError ?? null,
      canEdit: adminEnabled(),
    };
  }

  /** Stores the account (password encrypted) and restarts polling for the site. */
  async save(siteId: string, input: SmartessInput): Promise<SmartessStatus> {
    const account = await this.accountFromInput(siteId, input);
    const enabled = input.enabled !== false;
    const settings = buildSettingsOrReject(siteId, account);

    // The site row must exist before the connection row can reference it.
    await this.provision(settings);
    const data = {
      enabled,
      username: account.username,
      passwordCipher: encryptSecret(account.passwordSha1),
      devicePn: account.devicePn,
      deviceSn: account.deviceSn,
      deviceCode: settings.client.device?.devcode ?? null,
      deviceAddr: settings.client.device?.devaddr ?? null,
    };
    await prisma.smartessConnection.upsert({ where: { siteId }, update: data, create: { siteId, ...data } });
    await this.reload(siteId);
    return this.status(siteId);
  }

  /** Removes the stored account; an environment account, if any, takes over again. */
  async remove(siteId: string): Promise<SmartessStatus> {
    await prisma.smartessConnection.deleteMany({ where: { siteId } });
    await this.reload(siteId);
    return this.status(siteId);
  }

  /** Logs in and reads once with the given (or stored) account, without saving anything. */
  async test(siteId: string, input: SmartessInput) {
    const account = await this.accountFromInput(siteId, input);
    const settings = buildSettingsOrReject(siteId, account);
    try {
      const data = await new SmartessClient(settings.client).fetchLastData(hasHeadlineData);
      const reading = mapLastData(data, { timezoneOffset: settings.timezoneOffset });
      if (!reading) return { ok: false as const, error: "SmartESS answered, but returned no recognizable readings" };
      return {
        ok: true as const,
        deviceSn: maskTail(account.deviceSn),
        timestamp: reading.timestamp,
        solarPowerW: reading.inverter.solarPowerW ?? null,
        loadPowerW: reading.inverter.loadPowerW ?? null,
        batterySoc: reading.battery?.soc ?? null,
      };
    } catch (error) {
      return { ok: false as const, error: message(error) };
    }
  }

  /**
   * A blank password means "keep the stored one". A blank PN or SN means "find
   * the device on the account", which works when exactly one device matches.
   */
  private async accountFromInput(siteId: string, input: SmartessInput): Promise<Account> {
    const username = text(input.username, "username");
    let passwordSha1: string;
    if (typeof input.password === "string" && input.password !== "") {
      if (input.password.length > 200) throw new BadRequestException("password is not valid");
      passwordSha1 = sha1(input.password);
    } else {
      const saved = await prisma.smartessConnection.findUnique({ where: { siteId } });
      if (!saved) throw new BadRequestException("password is required");
      passwordSha1 = decryptSecret(saved.passwordCipher);
    }

    const wantedPn = blank(input.devicePn) ? null : text(input.devicePn, "devicePn", /^[A-Za-z0-9]+$/);
    const wantedSn = blank(input.deviceSn) ? null : text(input.deviceSn, "deviceSn", /^[A-Za-z0-9]+$/);
    // An SN that contains its own address needs no lookup.
    if (wantedPn && wantedSn && deviceFromSn(wantedPn, wantedSn)) {
      return { username, passwordSha1, devicePn: wantedPn, deviceSn: wantedSn };
    }

    let devices;
    try {
      devices = await new SmartessClient(accountClient(username, passwordSha1)).listDevices();
    } catch (error) {
      throw new BadRequestException(`could not list the devices of this SmartESS account: ${message(error)}`);
    }
    const matching = devices.filter((device) => (!wantedPn || device.pn === wantedPn) && (!wantedSn || device.sn === wantedSn));
    const [device] = matching;
    if (!device) {
      throw new BadRequestException(wantedPn || wantedSn ? "no device on this SmartESS account matches that PN/SN" : "no device was found on this SmartESS account");
    }
    if (matching.length > 1) {
      throw new BadRequestException(`the account has ${matching.length} devices; enter the PN and SN of one of: ${matching.map((item) => item.sn).join(", ")}`);
    }
    return { username, passwordSha1, devicePn: device.pn, deviceSn: device.sn, devcode: device.devcode, devaddr: device.devaddr };
  }

  private async resolveSettings(siteId: string): Promise<PollerSettings | null> {
    const saved = await prisma.smartessConnection.findUnique({ where: { siteId } });
    if (saved) {
      // A saved-but-disabled account turns polling off even if the environment has one.
      if (!saved.enabled) return null;
      return buildSettings("database", siteId, {
        username: saved.username,
        passwordSha1: decryptSecret(saved.passwordCipher),
        devicePn: saved.devicePn,
        deviceSn: saved.deviceSn,
        devcode: saved.deviceCode ?? undefined,
        devaddr: saved.deviceAddr ?? undefined,
      });
    }
    const account = siteId === envSiteId() ? envAccount() : null;
    return account ? buildSettings("environment", siteId, account) : null;
  }

  private provision(settings: PollerSettings) {
    return this.telemetry.ensureSiteAndGateway({
      siteId: settings.siteId,
      gatewayId: settings.gatewayId,
      serialNumber: settings.client.device?.pn ?? settings.gatewayId,
      siteName: "SmartESS site",
      gatewayName: "SmartESS cloud",
      model: "Wi-Fi Plug Pro RTU",
    });
  }

  private stop(siteId: string) {
    const runner = this.runners.get(siteId);
    if (!runner) return;
    runner.stopped = true;
    if (runner.timer) clearTimeout(runner.timer);
    this.runners.delete(siteId);
  }

  /** (Re)starts polling for a site from its current configuration. */
  private async reload(siteId: string) {
    this.stop(siteId);
    let settings: PollerSettings | null;
    try {
      settings = await this.resolveSettings(siteId);
      if (settings) await this.provision(settings);
    } catch (error) {
      this.logger.error(`SmartESS polling not started for site ${siteId}: ${message(error)}`);
      return;
    }
    if (!settings) return;

    const runner: Runner = { settings, client: new SmartessClient(settings.client), stopped: false, failures: 0 };
    this.runners.set(siteId, runner);
    this.logger.log(`SmartESS polling every ${settings.intervalMs / 1000}s for site ${siteId} (${settings.source} account)`);
    const loop = async () => {
      await this.pollOnce(runner);
      if (!runner.stopped) runner.timer = setTimeout(loop, settings.intervalMs);
    };
    void loop();
  }

  private async pollOnce(runner: Runner) {
    const { settings } = runner;
    runner.lastPollAt = new Date();
    try {
      const data = await runner.client.fetchLastData(hasHeadlineData);
      const reading = mapLastData(data, { timezoneOffset: settings.timezoneOffset });
      if (!reading) {
        runner.lastError = "SmartESS returned no recognizable parameters";
        this.logger.warn(runner.lastError);
        return;
      }
      runner.failures = 0;
      runner.lastError = undefined;
      runner.lastSuccessAt = new Date();
      // The collector only refreshes every few minutes; skip readings we already stored.
      if (reading.timestamp === runner.lastTimestamp) return;
      await this.telemetry.persistTelemetry(settings.siteId, settings.gatewayId, reading);
      runner.lastTimestamp = reading.timestamp;
    } catch (error) {
      runner.failures += 1;
      runner.lastError = message(error);
      this.logger.warn(`SmartESS poll failed (${runner.failures}): ${runner.lastError}`);
      if (runner.failures === 3) {
        await prisma.gateway
          .updateMany({ where: { id: settings.gatewayId, siteId: settings.siteId }, data: { status: "OFFLINE" } })
          .catch(() => undefined);
      }
    }
  }
}

function buildSettingsOrReject(siteId: string, account: Account) {
  try {
    return buildSettings("database", siteId, account);
  } catch (error) {
    throw new BadRequestException(message(error));
  }
}
