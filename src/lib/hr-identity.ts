// The HR app owns passwords and profiles. The dashboard asks it to check a password, then mirrors name, email and job title.
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { getWorkspace } from "./config";
import { hrConfigured } from "./hr-feed";
import { sameName, uniqueMatch } from "./name-match";
import { hashPassword } from "./auth/password";
import { bootstrapAdmins } from "./permissions";

export interface HrProfile { email: string; name: string; firstName: string; lastName: string; role: string | null }
export type HrCheck =
  | { status: "ok"; profile: HrProfile }
  | { status: "invalid" | "unknown" | "unverified" | "mfa" | "locked" | "down" };

export async function verifyWithHr(email: string, password: string): Promise<HrCheck> {
  try {
    const res = await fetch(`${process.env.HR_API_URL!.replace(/\/$/, "")}/integrations/verify-login`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { "content-type": "application/json", Authorization: `Bearer ${process.env.HR_API_TOKEN}` },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 429) return { status: "locked" };
    if (!res.ok) return { status: "down" };
    return (await res.json()) as HrCheck;
  } catch { return { status: "down" }; }
}

/**
 * Someone who signed up on the dashboard earlier, under a different email than their HR one, is the same person when the full
 * names match and only one account fits. Only accounts the HR app does not own yet are considered.
 */
export function pickLocalTwin<T extends { name: string; hrManaged: boolean; passwordHash: string | null }>(profileName: string, accounts: T[]): T | null {
  return uniqueMatch(profileName, accounts.filter((a) => !a.hrManaged && !!a.passwordHash));
}

/** Creates or updates the dashboard record for a person HR just vouched for. `firstTime` is true when HR did not own this record yet. */
export async function mirrorFromHr(p: HrProfile) {
  const row = await mirrorRecord(p);
  const dev = row.dev;
  await syncPhoto(dev, row.firstTime).catch(() => {}); // a photo problem must never stop someone signing in
  return dev;
}

async function mirrorRecord(p: HrProfile): Promise<{ dev: Awaited<ReturnType<typeof db.developer.update>>; firstTime: boolean }> {
  let dev = await db.developer.findUnique({ where: { email: p.email } });
  if (!dev) {
    const twin = pickLocalTwin(p.name, await db.developer.findMany({ where: { passwordHash: { not: null }, hrManaged: false } }));
    if (twin) dev = twin;
  }
  const common = { name: p.name, email: p.email, hrManaged: true, mustChangePassword: false, passwordChangedAt: new Date() };
  if (dev) {
    // Keep the existing role title when HR has none; never touch access level, Jira or GitHub links.
    const updated = await db.developer.update({ where: { id: dev.id }, data: { ...common, ...(p.role ? { role: p.role } : {}), passwordHash: await unusableHash() } });
    return { dev: updated, firstTime: !dev.hrManaged };
  }
  const created = await db.developer.create({
    data: {
      ...common, role: p.role ?? "Developer", access: bootstrapAdmins().includes(p.email) ? "ADMIN" : "DEVELOPER",
      passwordHash: await unusableHash(), capacityHrs: (await getWorkspace()).defaultCapacityHrs, avatarHue: Math.floor(Math.random() * 360),
    },
  });
  return { dev: created, firstTime: true };
}

// ---- profile photo: the HR app keeps the one real copy, this app keeps a small cached copy ----
const hrBase = () => process.env.HR_API_URL!.replace(/\/$/, "");
const hrHeaders = () => ({ Authorization: `Bearer ${process.env.HR_API_TOKEN}`, "content-type": "application/json" });
const mimeOf = (b: Uint8Array) => (b[0] === 0xff && b[1] === 0xd8 ? "image/jpeg" : b[0] === 0x89 && b[1] === 0x50 ? "image/png" : b[0] === 0x52 && b[1] === 0x49 ? "image/webp" : "image/jpeg");

export async function pushPhotoToHr(email: string, bytes: Uint8Array): Promise<boolean> {
  try {
    const r = await fetch(`${hrBase()}/integrations/photo`, { method: "PUT", headers: hrHeaders(), body: JSON.stringify({ email, imageBase64: Buffer.from(bytes).toString("base64") }), signal: AbortSignal.timeout(10_000) });
    return r.ok;
  } catch { return false; }
}
export async function removePhotoInHr(email: string): Promise<boolean> {
  try {
    const r = await fetch(`${hrBase()}/integrations/photo?email=${encodeURIComponent(email)}`, { method: "DELETE", headers: hrHeaders(), signal: AbortSignal.timeout(10_000) });
    return r.ok || r.status === 404;
  } catch { return false; }
}

/**
 * Makes this app's cached photo match HR. When HR has none and this is the first time HR owns the person, their existing
 * dashboard photo is handed over to HR instead of being lost. Afterwards HR is the source of truth, including removals.
 */
export async function syncPhoto(dev: { id: string; email: string }, firstTime: boolean) {
  const res = await fetch(`${hrBase()}/integrations/photo?email=${encodeURIComponent(dev.email)}`, { headers: hrHeaders(), cache: "no-store", signal: AbortSignal.timeout(8000) });
  const local = await db.avatarImage.findUnique({ where: { developerId: dev.id } });
  if (res.status === 404) {
    if (local && firstTime) await pushPhotoToHr(dev.email, local.data);
    else if (local) await db.$transaction([db.avatarImage.delete({ where: { developerId: dev.id } }), db.developer.update({ where: { id: dev.id }, data: { avatarVer: 0 } })]);
    return;
  }
  if (!res.ok) return;
  const { imageBase64 } = (await res.json()) as { mime: string; imageBase64: string };
  const bytes = new Uint8Array(Buffer.from(imageBase64, "base64"));
  if (local && Buffer.compare(Buffer.from(local.data), Buffer.from(bytes)) === 0) return;
  await db.$transaction([
    db.avatarImage.upsert({ where: { developerId: dev.id }, update: { mime: mimeOf(bytes), data: bytes }, create: { developerId: dev.id, mime: mimeOf(bytes), data: bytes } }),
    db.developer.update({ where: { id: dev.id }, data: { avatarVer: { increment: 1 } } }),
  ]);
}

/** A valid hash of a secret nobody knows: the account counts as "has an account", but no password works locally. */
const unusableHash = () => hashPassword(randomBytes(32).toString("base64url"));

export const hrOwnsIdentity = hrConfigured;
export { sameName };
