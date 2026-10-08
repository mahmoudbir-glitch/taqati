import { createHash } from "crypto";

/**
 * Minimal client for the SmartESS / DessMonitor cloud API (api.dessmonitor.com).
 *
 * Signing follows the public API docs:
 *   auth:  sign = sha1(salt + sha1(password) + actionString)
 *   calls: sign = sha1(salt + secret + token + actionString)
 * where actionString is "&action=...&k=v..." exactly as sent in the URL.
 *
 * Secrets, tokens and signed URLs are never logged or put in error messages.
 */

export interface SmartessDevice {
  pn: string;
  sn: string;
  devcode: string;
  devaddr: string;
}

export interface SmartessConfig {
  baseUrl: string;
  authAction: string;
  username: string;
  passwordSha1: string;
  companyKey: string;
  source: string;
  device: SmartessDevice;
}

export interface SmartessPar {
  id: string;
  par: string;
  val: string;
  unit?: string;
}

export interface SmartessLastData {
  gts?: string;
  pars: SmartessPar[];
}

interface Session {
  token: string;
  secret: string;
  expiresAt: number;
}

interface ApiEnvelope {
  err?: number;
  desc?: string;
  dat?: unknown;
}

const APP_PARAMS: Array<[string, string]> = [
  ["_app_client_", "web"],
  ["_app_id_", "taqati"],
  ["_app_version_", "1.0.0"],
];

export const sha1 = (value: string) => createHash("sha1").update(value).digest("hex");

export function buildAction(action: string, params: Array<[string, string]>) {
  return (
    `&action=${encodeURIComponent(action)}` +
    params.map(([key, value]) => `&${key}=${encodeURIComponent(value)}`).join("")
  );
}

export class SmartessApiError extends Error {
  constructor(
    readonly action: string,
    readonly code: number | undefined,
    description: string | undefined,
  ) {
    super(`SmartESS ${action} failed (err=${code ?? "unknown"}${description ? `: ${description}` : ""})`);
    this.name = "SmartessApiError";
  }
}

export class SmartessClient {
  private session?: Session;

  constructor(private readonly config: SmartessConfig) {}

  async fetchLastData(): Promise<SmartessLastData> {
    const { device, source } = this.config;
    const dat = await this.call("querySPDeviceLastData", [
      ["source", source],
      ["devcode", device.devcode],
      ["pn", device.pn],
      ["devaddr", device.devaddr],
      ["sn", device.sn],
      ["i18n", "en_US"],
    ]);
    return parseLastData(dat);
  }

  private async authenticate(): Promise<Session> {
    const { baseUrl, authAction, username, passwordSha1, companyKey, source } = this.config;
    const salt = String(Date.now());
    const action = buildAction(authAction, [
      ["usr", username],
      ["company-key", companyKey],
      ["source", source],
      ...APP_PARAMS,
    ]);
    const sign = sha1(salt + passwordSha1 + action);
    const body = await this.request(authAction, `${baseUrl}?sign=${sign}&salt=${salt}${action}`);

    const dat = body.dat as { token?: unknown; secret?: unknown; expire?: unknown } | undefined;
    if (!dat || typeof dat.token !== "string" || typeof dat.secret !== "string") {
      throw new SmartessApiError(authAction, body.err, "missing token/secret in response");
    }
    const expireSeconds = typeof dat.expire === "number" ? dat.expire : Number(dat.expire);
    const ttlMs = (Number.isFinite(expireSeconds) && expireSeconds > 0 ? expireSeconds : 3600) * 1000;
    return { token: dat.token, secret: dat.secret, expiresAt: Date.now() + ttlMs };
  }

  private async ensureSession() {
    if (!this.session || this.session.expiresAt - Date.now() < 60_000) {
      this.session = await this.authenticate();
    }
    return this.session;
  }

  private async call(action: string, params: Array<[string, string]>, retry = true): Promise<unknown> {
    const session = await this.ensureSession();
    const salt = String(Date.now());
    const actionString = buildAction(action, [...params, ...APP_PARAMS]);
    const sign = sha1(salt + session.secret + session.token + actionString);
    const url = `${this.config.baseUrl}?sign=${sign}&salt=${salt}&token=${session.token}${actionString}`;

    try {
      return (await this.request(action, url)).dat;
    } catch (error) {
      // An expired/invalid session is the common cause of a failed call: log in again once.
      if (retry && error instanceof SmartessApiError) {
        this.session = undefined;
        return this.call(action, params, false);
      }
      throw error;
    }
  }

  private async request(action: string, url: string): Promise<ApiEnvelope> {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      throw new SmartessApiError(action, undefined, `HTTP ${response.status}`);
    }
    const body = (await response.json()) as ApiEnvelope;
    if (body.err !== 0) {
      throw new SmartessApiError(action, body.err, body.desc);
    }
    return body;
  }
}

export function parseLastData(dat: unknown): SmartessLastData {
  if (!dat || typeof dat !== "object") return { pars: [] };
  const record = dat as { gts?: unknown; pars?: unknown };
  const pars: SmartessPar[] = [];

  if (record.pars && typeof record.pars === "object") {
    for (const group of Object.values(record.pars as Record<string, unknown>)) {
      if (!Array.isArray(group)) continue;
      for (const item of group) {
        if (!item || typeof item !== "object") continue;
        const entry = item as Record<string, unknown>;
        if (typeof entry.par !== "string" || entry.val === undefined || entry.val === null) continue;
        pars.push({
          id: typeof entry.id === "string" ? entry.id : "",
          par: entry.par,
          val: String(entry.val),
          unit: typeof entry.unit === "string" ? entry.unit : undefined,
        });
      }
    }
  }

  return { gts: typeof record.gts === "string" ? record.gts : undefined, pars };
}
