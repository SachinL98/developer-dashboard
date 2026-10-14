import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { atLeast, canMoveTicket, canPatchTicket, emailAllowed } from "../src/lib/permissions";
import { decrypt, encrypt, safeEqual, sha256 } from "../src/lib/crypto";
import { LoginError, decodeJwtPayload, validateClaims } from "../src/lib/auth/identity";
import { safeNext } from "../src/lib/auth/oauth";
import { formatTranscript, meetCodeFromUrl } from "../src/lib/integrations/meet";

const dev = { id: "d1", access: "DEVELOPER" as const };
const lead = { id: "l1", access: "LEAD" as const };
const admin = { id: "a1", access: "ADMIN" as const };
const mine = { assigneeId: "d1" }, theirs = { assigneeId: "d2" }, unassigned = { assigneeId: null };

describe("roles", () => {
  it("ranks access levels", () => {
    expect(atLeast("ADMIN", "LEAD")).toBe(true);
    expect(atLeast("DEVELOPER", "LEAD")).toBe(false);
  });
  it("developers move only their own cards, only up to Review", () => {
    expect(canMoveTicket(dev, mine, "IN_PROGRESS")).toBe(true);
    expect(canMoveTicket(dev, mine, "INITIAL_REVIEW")).toBe(true);
    expect(canMoveTicket(dev, mine, "REVIEW")).toBe(true);
    expect(canMoveTicket(dev, theirs, "INITIAL_REVIEW")).toBe(false);
    expect(canMoveTicket(dev, unassigned, "IN_PROGRESS")).toBe(false);
    for (const to of ["READY_TO_DEV", "DEPLOYED_STG", "FAILED_STG", "DOCUMENTED", "DEPLOYED_PROD", "DONE"] as const) expect(canMoveTicket(dev, mine, to)).toBe(false);
  });
  it("leads and admins move anything", () => {
    expect(canMoveTicket(lead, theirs, "DEPLOYED_STG")).toBe(true);
    expect(canMoveTicket(admin, unassigned, "DONE")).toBe(true);
  });
  it("developers can edit their own tickets but not reassign or reprioritise", () => {
    expect(canPatchTicket(dev, mine, ["prUrl", "estimateHrs"])).toBe(true);
    expect(canPatchTicket(dev, mine, ["assigneeId"])).toBe(false);
    expect(canPatchTicket(dev, mine, ["priority"])).toBe(false);
    expect(canPatchTicket(dev, theirs, ["prUrl"])).toBe(false);
    expect(canPatchTicket(lead, theirs, ["assigneeId"])).toBe(true);
  });
});

describe("email domain", () => {
  beforeEach(() => { delete process.env.AUTH_ALLOWED_DOMAIN; });
  it("accepts only the office domain", () => {
    expect(emailAllowed("sachin.lakshan@spaceitlabs.com")).toBe(true);
    expect(emailAllowed("SACHIN@SpaceITLabs.com")).toBe(true);
    expect(emailAllowed("x@gmail.com")).toBe(false);
    expect(emailAllowed("x@spaceitlabs.com.evil.io")).toBe(false);
    expect(emailAllowed("x@evil.io@spaceitlabs.com")).toBe(false);
    expect(emailAllowed("")).toBe(false);
  });
});

describe("ID token claims", () => {
  const now = Date.now();
  const ok = { iss: "https://accounts.google.com", aud: "cid", exp: Math.floor(now / 1000) + 600, sub: "123", email: "a@spaceitlabs.com", email_verified: true, hd: "spaceitlabs.com", name: "A" };
  it("accepts a valid token", () => expect(validateClaims(ok, "cid", now)).toMatchObject({ email: "a@spaceitlabs.com", sub: "123" }));
  it.each([
    ["wrong issuer", { iss: "https://evil.example" }],
    ["wrong audience", { aud: "other" }],
    ["expired", { exp: Math.floor(now / 1000) - 5 }],
    ["unverified email", { email_verified: false }],
    ["other domain", { email: "a@gmail.com", hd: undefined }],
    ["mismatched hd", { hd: "evil.io" }],
    ["no email", { email: undefined }],
  ])("rejects %s", (_n, patch) => expect(() => validateClaims({ ...ok, ...patch }, "cid", now)).toThrow(LoginError));
  it("decodes the JWT payload", () => {
    const jwt = "h." + Buffer.from(JSON.stringify(ok)).toString("base64url") + ".s";
    expect(decodeJwtPayload(jwt).sub).toBe("123");
    expect(() => decodeJwtPayload("nope")).toThrow();
  });
});

describe("token encryption", () => {
  const old = process.env.AUTH_SECRET;
  beforeEach(() => { process.env.AUTH_SECRET = "x".repeat(40); });
  afterEach(() => { if (old === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = old; });
  it("round-trips and is non-deterministic", () => {
    const a = encrypt("refresh-token"), b = encrypt("refresh-token");
    expect(a).not.toBe(b);
    expect(a).not.toContain("refresh-token");
    expect(decrypt(a)).toBe("refresh-token");
  });
  it("detects tampering and wrong keys", () => {
    const blob = encrypt("secret");
    const parts = blob.split(".");
    parts[3] = Buffer.from("tampered!").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
    process.env.AUTH_SECRET = "y".repeat(40);
    expect(() => decrypt(blob)).toThrow();
  });
  it("hashes and compares in constant time", () => {
    expect(sha256("a")).toHaveLength(64);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
  it("refuses to run without a real secret in production", () => {
    delete process.env.AUTH_SECRET;
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV; env.NODE_ENV = "production";
    try { expect(() => encrypt("x")).toThrow(/AUTH_SECRET/); } finally { env.NODE_ENV = prev; }
  });
});

describe("redirect safety", () => {
  it("only allows same-site relative paths", () => {
    expect(safeNext("/board?x=1")).toBe("/board?x=1");
    for (const bad of ["https://evil.io", "//evil.io", "/\\evil.io", "javascript:alert(1)", "", null, undefined]) expect(safeNext(bad as any)).toBe("/");
  });
});

describe("Meet transcripts", () => {
  it("extracts the meeting code", () => {
    expect(meetCodeFromUrl("https://meet.google.com/abc-defg-hij")).toBe("abc-defg-hij");
    expect(meetCodeFromUrl("https://meet.google.com/abc-defg-hij?authuser=0")).toBe("abc-defg-hij");
    expect(meetCodeFromUrl("https://example.com")).toBeNull();
    expect(meetCodeFromUrl(null)).toBeNull();
  });
  it("orders entries, names speakers and merges consecutive turns", () => {
    const names = { p1: "Amaya Perera", p2: "Nuwan Silva" };
    const text = formatTranscript([
      { participant: "p2", text: "Blocked on staging credentials.", startTime: "2026-10-14T03:16:00Z" },
      { participant: "p1", text: "Yesterday I finished ATL-101.", startTime: "2026-10-14T03:15:00Z" },
      { participant: "p1", text: "Today the audit log.", startTime: "2026-10-14T03:15:20Z" },
      { participant: "p3", text: "  ", startTime: "2026-10-14T03:17:00Z" },
      { participant: "zz", text: "Who is this?", startTime: "2026-10-14T03:18:00Z" },
    ], names);
    expect(text).toBe("Amaya Perera: Yesterday I finished ATL-101. Today the audit log.\nNuwan Silva: Blocked on staging credentials.\nSpeaker: Who is this?");
  });
});
