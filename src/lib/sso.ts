// Single sign-on hand-off tokens shared with the HR app (same format as apps/api/src/common/sso.ts there).
// `payload.signature`, base64url; HMAC-SHA256 with SSO_SECRET; one minute; addressed to one app (`aud`).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type SsoAudience = "hr" | "dash";
export interface SsoClaims { email: string; aud: SsoAudience; exp: number; n: string; name?: string; role?: string | null }
export const SSO_TTL_SECONDS = 60;

const sig = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");
export const ssoSecret = (): string | null => { const s = process.env.SSO_SECRET; return s && s.length >= 32 ? s : null; };

export function signSso(email: string, aud: SsoAudience, secret: string, now = Date.now()): string {
  const claims: SsoClaims = { email: email.toLowerCase(), aud, exp: Math.floor(now / 1000) + SSO_TTL_SECONDS, n: randomBytes(8).toString("hex") };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sig(payload, secret)}`;
}

export function verifySso(token: string, aud: SsoAudience, secret: string, now = Date.now()): SsoClaims | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const want = Buffer.from(sig(payload, secret)), got = Buffer.from(signature);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SsoClaims;
    if (c.aud !== aud || typeof c.email !== "string" || typeof c.exp !== "number" || c.exp * 1000 < now) return null;
    return c;
  } catch { return null; }
}

export const hrWebUrl = () => process.env.HR_WEB_URL?.replace(/\/$/, "") || null;
