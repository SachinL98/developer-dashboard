import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signSso, verifySso } from "../src/lib/sso";

const secret = "k".repeat(40);

describe("single sign-on tokens", () => {
  it("round-trips for the right app only", () => {
    const t = signSso("A@X.com", "hr", secret);
    expect(verifySso(t, "hr", secret)?.email).toBe("a@x.com");
    expect(verifySso(t, "dash", secret)).toBeNull();
  });
  it("accepts a token built the way the HR API builds it", () => {
    const payload = Buffer.from(JSON.stringify({ email: "a@x.com", aud: "dash", exp: Math.floor(Date.now() / 1000) + 30, n: "1" })).toString("base64url");
    const token = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
    expect(verifySso(token, "dash", secret)?.email).toBe("a@x.com");
  });
  it("rejects wrong secrets, tampering, junk and expired tokens", () => {
    const now = Date.now();
    const t = signSso("a@x.com", "dash", secret, now);
    expect(verifySso(t, "dash", "z".repeat(40))).toBeNull();
    const forged = Buffer.from(JSON.stringify({ email: "boss@x.com", aud: "dash", exp: 9e9, n: "1" })).toString("base64url");
    expect(verifySso(`${forged}.${t.split(".")[1]}`, "dash", secret)).toBeNull();
    expect(verifySso("junk", "dash", secret)).toBeNull();
    expect(verifySso(t, "dash", secret, now + 61_000)).toBeNull();
  });
});
