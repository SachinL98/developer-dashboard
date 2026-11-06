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

/** Creates or updates the dashboard record for a person HR just vouched for. Returns it. */
export async function mirrorFromHr(p: HrProfile) {
  let dev = await db.developer.findUnique({ where: { email: p.email } });
  if (!dev) {
    const twin = pickLocalTwin(p.name, await db.developer.findMany({ where: { passwordHash: { not: null }, hrManaged: false } }));
    if (twin) dev = twin;
  }
  const common = { name: p.name, email: p.email, hrManaged: true, mustChangePassword: false, passwordChangedAt: new Date() };
  if (dev) {
    // Keep the existing role title when HR has none; never touch access level, Jira or GitHub links.
    return db.developer.update({ where: { id: dev.id }, data: { ...common, ...(p.role ? { role: p.role } : {}), passwordHash: await unusableHash() } });
  }
  return db.developer.create({
    data: {
      ...common, role: p.role ?? "Developer", access: bootstrapAdmins().includes(p.email) ? "ADMIN" : "DEVELOPER",
      passwordHash: await unusableHash(), capacityHrs: (await getWorkspace()).defaultCapacityHrs, avatarHue: Math.floor(Math.random() * 360),
    },
  });
}

/** A valid hash of a secret nobody knows: the account counts as "has an account", but no password works locally. */
const unusableHash = () => hashPassword(randomBytes(32).toString("base64url"));

export const hrOwnsIdentity = hrConfigured;
export { sameName };
