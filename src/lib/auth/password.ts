// Password hashing and rules. Pure Node crypto (scrypt), no database, so scripts and tests can import it.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 16384, R = 8, P = 1, KEYLEN = 64;
const derive = (pw: string, salt: Buffer, n = N, r = R, p = P) =>
  new Promise<Buffer>((res, rej) => scrypt(pw.normalize("NFKC"), salt, KEYLEN, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));

/** `scrypt$N$r$p$salt$hash` (base64url). */
export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pw, salt);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  try {
    const key = await derive(pw, Buffer.from(salt, "base64url"), +n, +r, +p);
    const want = Buffer.from(hash, "base64url");
    return key.length === want.length && timingSafeEqual(key, want);
  } catch { return false; }
}

let dummy: Promise<string> | null = null;
/** Spend the same time as a real check when the account does not exist, so response time does not reveal which emails are registered. */
export async function burnPasswordCheck(pw: string): Promise<void> {
  dummy ??= hashPassword("not-a-real-password");
  await verifyPassword(pw, await dummy);
}

export const MIN_PASSWORD = 12;
const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "admin", "iloveyou", "changeme", "spaceit"];

/** Null when acceptable, otherwise what to fix. */
export function passwordProblem(pw: string, who: { email?: string; name?: string } = {}): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw.length > 200) return "Use at most 200 characters.";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Include at least one letter and one number.";
  const low = pw.toLowerCase();
  const local = who.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && low.includes(local)) return "Don't include your email name in the password.";
  const first = who.name?.split(" ")[0]?.toLowerCase();
  if (first && first.length >= 4 && low.includes(first)) return "Don't include your name in the password.";
  if (COMMON.some((c) => low.includes(c))) return "That password is too easy to guess.";
  if (/^(.)\1+$/.test(pw)) return "That password is too easy to guess.";
  return null;
}

/** One-time password for new or reset accounts: 16 characters, no look-alikes. The user must change it at first sign-in. */
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  for (;;) {
    const bytes = randomBytes(16);
    const raw = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    if (/[0-9]/.test(raw) && /[a-z]/.test(raw) && /[A-Z]/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
  }
}

export const MAX_FAILS = 5;
export const LOCK_MINUTES = 15;
/** Whether an account is currently locked, and the failure count after one more wrong attempt. */
export const isLocked = (lockedUntil: Date | null | undefined, now = new Date()) => !!lockedUntil && lockedUntil.getTime() > now.getTime();
export function afterFailure(failed: number, now = new Date()): { failedLogins: number; lockedUntil: Date | null } {
  const n = failed + 1;
  return n >= MAX_FAILS ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } : { failedLogins: n, lockedUntil: null };
}
