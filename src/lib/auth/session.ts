import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { atLeast, type AccessLevel } from "../permissions";
import { bindUser } from "../context";

export const SESSION_COOKIE = "sid";
const TTL_DAYS = 14;
const secure = () => process.env.NODE_ENV === "production";

export async function createSession(userId: string) {
  const token = randomToken();
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  await db.authSession.create({ data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + TTL_DAYS * 864e5), userAgent: ua } });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: TTL_DAYS * 86400 });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.authSession.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Also binds the user for per-user Jira/Google calls made later in this request. */
export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await db.authSession.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date() || !s.user.active) return null;
  bindUser(s.user.id);
  return s.user;
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export class ForbiddenError extends Error {}

/** For server actions: throws instead of redirecting so the action can return a clean error. */
export async function requireAccess(min: AccessLevel) {
  const u = await currentUser();
  if (!u) throw new ForbiddenError("Your session has expired. Sign in again.");
  if (!atLeast(u.access, min)) throw new ForbiddenError(min === "ADMIN" ? "Admins only." : "Leads and admins only.");
  return u;
}

export async function pruneSessions() {
  await db.authSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
