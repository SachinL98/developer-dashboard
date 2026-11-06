import { describe, expect, it } from "vitest";
import { pickLocalTwin } from "../src/lib/hr-identity";
import { signSso, verifySso } from "../src/lib/sso";

const acct = (name: string, hrManaged = false, passwordHash: string | null = "h") => ({ name, hrManaged, passwordHash });

describe("pickLocalTwin", () => {
  it("finds the one earlier dashboard account with the same full name", () => {
    const a = acct("Ishara Sandaruwan");
    expect(pickLocalTwin("Ishara Sandaruwan", [a, acct("Nimal Fernando")])).toBe(a);
  });
  it("ignores accounts HR already owns, and Jira-only people without a password", () => {
    expect(pickLocalTwin("Ishara Sandaruwan", [acct("Ishara Sandaruwan", true)])).toBeNull();
    expect(pickLocalTwin("Ishara Sandaruwan", [acct("Ishara Sandaruwan", false, null)])).toBeNull();
  });
  it("never guesses between two", () => {
    expect(pickLocalTwin("Ishara Sandaruwan", [acct("Ishara Sandaruwan"), acct("Sandaruwan Ishara")])).toBeNull();
  });
});

describe("SSO token profile", () => {
  it("carries the vouched name and job title", () => {
    const secret = "k".repeat(40);
    const payload = Buffer.from(JSON.stringify({ email: "a@x.com", aud: "dash", exp: Math.floor(Date.now() / 1000) + 30, n: "1", name: "Ada Lovelace", role: "Engineer" })).toString("base64url");
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const token = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
    const c = verifySso(token, "dash", secret);
    expect(c?.name).toBe("Ada Lovelace");
    expect(c?.role).toBe("Engineer");
    expect(verifySso(signSso("a@x.com", "dash", secret), "dash", secret)?.name).toBeUndefined();
  });
});
