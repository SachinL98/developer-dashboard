import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** AUTH_SECRET is required in production; a fixed dev key is used otherwise so demo mode works out of the box. */
function secret(): Buffer {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set in production (use `openssl rand -base64 48`)");
    return createHash("sha256").update("dev-only-insecure-secret").digest();
  }
  if (s.length < 32 && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be at least 32 characters");
  return createHash("sha256").update(s).digest();
}

/** AES-256-GCM, output `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secret(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(blob: string): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised token format");
  const d = createDecipheriv("aes-256-gcm", secret(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
