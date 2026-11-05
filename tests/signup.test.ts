import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  developer: { findUnique: vi.fn() },
  signupRequest: { count: vi.fn(), upsert: vi.fn() },
}));
vi.mock("../src/lib/db", () => ({ db }));
vi.mock("../src/lib/config", () => ({ getWorkspace: async () => ({ defaultCapacityHrs: 30 }) }));

import { MAX_PENDING, SIGNUP_DONE, submitSignup } from "../src/lib/auth/signup";
import { LoginError } from "../src/lib/auth/identity";
import { resetRateLimits } from "../src/lib/rate-limit";

const good = { name: "Amaya Perera", email: "Amaya.P@spaceitlabs.com", jobTitle: "Tech Lead", password: "blue-Table-4-lamp", confirm: "blue-Table-4-lamp" };

beforeEach(() => { vi.clearAllMocks(); resetRateLimits(); db.developer.findUnique.mockResolvedValue(null); db.signupRequest.count.mockResolvedValue(0); });

describe("submitSignup", () => {
  it("stores a request with a hashed password and lowercase email", async () => {
    expect(await submitSignup(good, "1.1.1.1")).toBe(SIGNUP_DONE);
    const arg = db.signupRequest.upsert.mock.calls[0][0];
    expect(arg.create.email).toBe("amaya.p@spaceitlabs.com");
    expect(arg.create.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(arg)).not.toContain("blue-Table-4-lamp");
  });
  it("accepts any email domain but rejects malformed addresses", async () => {
    expect(await submitSignup({ ...good, email: "someone@gmail.com" }, "1.1.1.2")).toBe(SIGNUP_DONE);
    expect(db.signupRequest.upsert).toHaveBeenCalledTimes(1);
    await expect(submitSignup({ ...good, email: "not-an-email" }, "1.1.1.2")).rejects.toThrow();
  });
  it("rejects mismatched or weak passwords", async () => {
    await expect(submitSignup({ ...good, confirm: "different-Pass-9" }, "1.1.1.3")).rejects.toThrow(/match/);
    await expect(submitSignup({ ...good, password: "short1", confirm: "short1" }, "1.1.1.3")).rejects.toThrow(/12/);
  });
  it("answers the same for an email that already has an account, and creates nothing", async () => {
    db.developer.findUnique.mockResolvedValue({ id: "x" });
    expect(await submitSignup(good, "1.1.1.4")).toBe(SIGNUP_DONE);
    expect(db.signupRequest.upsert).not.toHaveBeenCalled();
  });
  it("stops when too many requests are waiting", async () => {
    db.signupRequest.count.mockResolvedValue(MAX_PENDING);
    await expect(submitSignup(good, "1.1.1.5")).rejects.toThrow(/waiting/);
  });
  it("rate limits one network", async () => {
    for (let i = 0; i < 5; i++) await submitSignup({ ...good, email: `p${i}@spaceitlabs.com` }, "9.9.9.9");
    await expect(submitSignup(good, "9.9.9.9")).rejects.toThrow(/Too many/);
  });
  it("can be switched off", async () => {
    process.env.SIGNUP_ENABLED = "false";
    await expect(submitSignup(good, "1.1.1.6")).rejects.toThrow(/closed/);
    delete process.env.SIGNUP_ENABLED;
  });
});
