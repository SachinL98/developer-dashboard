import { linkToJiraOnSignIn } from "../jira-people";
import { db } from "../db";
import { LoginError } from "./identity";
import { afterFailure, burnPasswordCheck, hashPassword, isLocked, passwordProblem, verifyPassword } from "./password";
import { rateLimitShared, RateLimited } from "../rate-limit";
import { getWorkspace } from "../config";
import { hrOwnsIdentity, mirrorFromHr, verifyWithHr } from "../hr-identity";
import { bootstrapAdmins, isValidEmail } from "../permissions";

const GENERIC = "Incorrect email or password. After several wrong attempts the account is locked for a few minutes.";

/** Verifies email + password. Same message for every failure so nobody can learn which emails exist. */
export async function verifyLogin(emailRaw: string, password: string, ip: string) {
  const email = emailRaw.trim().toLowerCase();
  try {
    await rateLimitShared(`login-ip:${ip}`, 30, 10 * 60_000);
    await rateLimitShared(`login-email:${email}`, 15, 10 * 60_000);
  } catch (e) { if (e instanceof RateLimited) throw new LoginError("Too many attempts. Wait a few minutes and try again."); throw e; }
  if (!email || !password || password.length > 500) throw new LoginError(GENERIC);

  // When the HR app owns accounts, it decides whether the password is right and we mirror the person's profile.
  let hrDown = false, hrUnknown = false;
  if (hrOwnsIdentity()) {
    const hr = await verifyWithHr(email, password);
    switch (hr.status) {
      case "ok": {
        const dev = await mirrorFromHr(hr.profile);
        if (!dev.active) throw new LoginError("Your account has been deactivated. Ask an admin.");
        const signedIn = await db.developer.update({ where: { id: dev.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
        await linkToJiraOnSignIn(dev.id);
        return signedIn;
      }
      case "invalid": throw new LoginError(GENERIC);
      case "locked": throw new LoginError("Too many attempts. Wait a few minutes and try again.");
      case "mfa": throw new LoginError("Two-factor sign-in is on for your account. Sign in to the HR app first, then use Switch to Dev Dashboard.");
      case "unverified": throw new LoginError("Confirm your email in the HR app first, then sign in again.");
      case "down": hrDown = true; break;
      case "unknown": hrUnknown = true; break;
    }
  }

  const user = await db.developer.findUnique({ where: { email } });
  // Accounts owned by the HR app never fall back to a local password: someone removed from HR must not get in, and an outage must not open a back door.
  if (user?.hrManaged && (hrUnknown || hrDown)) {
    await burnPasswordCheck(password);
    throw new LoginError(hrDown ? "Sign-in is unavailable right now. Please try again in a few minutes." : GENERIC);
  }
  if (!user) {
    // A pending sign-up request: only someone who knows the password they chose is told it is waiting.
    const req = await db.signupRequest.findUnique({ where: { email } });
    if (req && (await verifyPassword(password, req.passwordHash))) throw new LoginError("Your sign-up request is waiting for an admin to approve it.");
    if (!req) await burnPasswordCheck(password);
    throw new LoginError(GENERIC);
  }
  if (!user.passwordHash) { await burnPasswordCheck(password); throw new LoginError(GENERIC); }
  if (isLocked(user.lockedUntil)) { await burnPasswordCheck(password); throw new LoginError(GENERIC); }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await db.developer.update({ where: { id: user.id }, data: afterFailure(user.failedLogins) });
    throw new LoginError(GENERIC);
  }
  if (!user.active) throw new LoginError("Your account has been deactivated. Ask an admin.");
  const signedIn = await db.developer.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await linkToJiraOnSignIn(user.id); // a Jira person who is clearly this account gets folded in, so there are never two of them
  return signedIn;
}

export interface NewUser { name: string; email: string; access?: "DEVELOPER" | "LEAD" | "ADMIN" }

/** Creates an account with a one-time password the user must change at first sign-in. Used by admins and the first-admin script. */
export async function createUserWithPassword(u: NewUser, password: string) {
  const email = u.email.trim().toLowerCase();
  if (!isValidEmail(email)) throw new Error("Enter a valid email address.");
  if (u.name.trim().length < 2) throw new Error("Enter the person's name.");
  const existing = await db.developer.findUnique({ where: { email } });
  if (existing?.passwordHash) throw new Error("A user with that email already exists.");
  const bad = passwordProblem(password, { email, name: u.name });
  if (bad) throw new Error(bad);
  const access = u.access ?? (bootstrapAdmins().includes(email) ? "ADMIN" : "DEVELOPER");
  // Already imported from Jira (no password yet): give that person a login instead of creating a duplicate.
  if (existing) return db.developer.update({ where: { id: existing.id }, data: { name: u.name.trim(), access, passwordHash: await hashPassword(password), mustChangePassword: true, active: true } });
  return db.developer.create({
    data: {
      email, name: u.name.trim(), access, passwordHash: await hashPassword(password), mustChangePassword: true,
      capacityHrs: (await getWorkspace()).defaultCapacityHrs, avatarHue: Math.floor(Math.random() * 360),
    },
  });
}
