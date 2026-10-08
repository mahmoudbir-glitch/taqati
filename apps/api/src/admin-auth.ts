import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash, timingSafeEqual } from "crypto";

const MIN_TOKEN_LENGTH = 16;

export const adminEnabled = () => (process.env.ADMIN_TOKEN ?? "").length >= MIN_TOKEN_LENGTH;

/**
 * Guards the few endpoints that change configuration. The caller sends
 * `Authorization: Bearer <ADMIN_TOKEN>`; without a configured token those
 * endpoints stay closed rather than open.
 */
export function assertAdmin(authorization: string | undefined) {
  if (!adminEnabled()) {
    throw new ServiceUnavailableException(`ADMIN_TOKEN (at least ${MIN_TOKEN_LENGTH} characters) is not configured on the server`);
  }
  const presented = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1]?.trim() ?? "";
  // Hashing first gives equal-length buffers, so the comparison leaks nothing about length.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!presented || !timingSafeEqual(digest(presented), digest(process.env.ADMIN_TOKEN as string))) {
    throw new UnauthorizedException("Invalid admin token");
  }
}
