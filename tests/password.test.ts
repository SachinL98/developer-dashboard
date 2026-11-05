import { describe, expect, it } from "vitest";
import { afterFailure, generateTempPassword, hashPassword, isLocked, LOCK_MINUTES, MAX_FAILS, passwordProblem, verifyPassword } from "../src/lib/auth/password";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const h = await hashPassword("Correct-Horse-9");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("Correct-Horse-9", h)).toBe(true);
    expect(await verifyPassword("correct-horse-9", h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
  });
  it("uses a fresh salt each time and never stores the password", async () => {
    const a = await hashPassword("Same-Password-1"), b = await hashPassword("Same-Password-1");
    expect(a).not.toBe(b);
    expect(a).not.toContain("Same-Password");
  });
  it("rejects malformed stored values instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "scrypt$bad")).toBe(false);
    expect(await verifyPassword("x", "plaintext")).toBe(false);
  });
});

describe("passwordProblem", () => {
  const who = { email: "amaya.perera@spaceitlabs.com", name: "Amaya Perera" };
  it("accepts a reasonable password", () => { expect(passwordProblem("blue-Table-4-lamp", who)).toBeNull(); });
  it("enforces length, letter and number", () => {
    expect(passwordProblem("short1A", who)).toMatch(/12/);
    expect(passwordProblem("onlyletterslongenough", who)).toMatch(/number/);
    expect(passwordProblem("123456789012345", who)).toMatch(/letter/);
  });
  it("blocks the user's own name or email and common words", () => {
    expect(passwordProblem("amaya-Loves-Cats-77", who)).toMatch(/name/);
    expect(passwordProblem("xx-perera.amaya-99", { email: "perera.amaya@spaceitlabs.com" })).toMatch(/email/);
    expect(passwordProblem("Password-12345678", who)).toMatch(/easy/);
  });
});

describe("temporary passwords", () => {
  it("are strong, unique and pass the rules", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const t = generateTempPassword();
      expect(t).toMatch(/^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){3}$/);
      expect(/[0-9]/.test(t) && /[a-z]/.test(t) && /[A-Z]/.test(t)).toBe(true);
      expect(passwordProblem(t)).toBeNull();
      seen.add(t);
    }
    expect(seen.size).toBe(200);
  });
});

describe("lockout", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  it("counts failures and locks after the limit", () => {
    expect(afterFailure(0, now)).toEqual({ failedLogins: 1, lockedUntil: null });
    const r = afterFailure(MAX_FAILS - 1, now);
    expect(r.failedLogins).toBe(0);
    expect(r.lockedUntil!.getTime() - now.getTime()).toBe(LOCK_MINUTES * 60_000);
  });
  it("reports whether an account is locked", () => {
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(new Date(now.getTime() + 1000), now)).toBe(true);
    expect(isLocked(new Date(now.getTime() - 1000), now)).toBe(false);
  });
});
