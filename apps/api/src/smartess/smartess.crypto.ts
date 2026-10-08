import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// AES-256-GCM with a key derived from SMARTESS_CONFIG_SECRET (or ADMIN_TOKEN).
// Stored form: "v1.<iv>.<tag>.<ciphertext>", each part base64url.

function key(): Buffer {
  const secret = process.env.SMARTESS_CONFIG_SECRET || process.env.ADMIN_TOKEN;
  if (!secret) throw new Error("SMARTESS_CONFIG_SECRET or ADMIN_TOKEN is required to store SmartESS credentials");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

/** Throws when the value was encrypted with a different secret or was altered. */
export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("unsupported credential format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
