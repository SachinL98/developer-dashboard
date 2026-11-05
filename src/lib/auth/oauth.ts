import { cookies } from "next/headers";
import { randomToken, safeEqual } from "../crypto";
import { createHash } from "node:crypto";

const COOKIE = "oauth_tx";

export const appUrl = (req: Request) => (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");

/** Only same-site relative paths: blocks open redirects through `?next=`. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}

export interface Tx { provider: "google" | "atlassian"; mode: "login" | "connect"; state: string; verifier: string; next: string }

export async function beginTx(provider: Tx["provider"], mode: Tx["mode"], next: string) {
  const tx: Tx = { provider, mode, state: randomToken(24), verifier: randomToken(48), next: safeNext(next) };
  (await cookies()).set(COOKIE, Buffer.from(JSON.stringify(tx)).toString("base64url"), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth", maxAge: 600,
  });
  return { tx, challenge: createHash("sha256").update(tx.verifier).digest("base64url") };
}

/** Validates the `state` returned by the provider against the cookie set when the flow began (one use). */
export async function finishTx(provider: Tx["provider"], state: string | null): Promise<Tx | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  if (!raw || !state) return null;
  try {
    const tx = JSON.parse(Buffer.from(raw, "base64url").toString()) as Tx;
    return tx.provider === provider && safeEqual(tx.state, state) ? tx : null;
  } catch { return null; }
}

export const googleLoginConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
/** Demo sign-in exists only while real sign-in is NOT configured: configuring Google switches it off even if DEMO_MODE=true. */
export const demoMode = () => !googleLoginConfigured() && (process.env.DEMO_MODE === "true" || process.env.NODE_ENV !== "production");
export const atlassianConfigured = () => !!(process.env.ATLASSIAN_CLIENT_ID && process.env.ATLASSIAN_CLIENT_SECRET);
