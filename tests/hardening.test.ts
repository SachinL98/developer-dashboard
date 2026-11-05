import { beforeEach, describe, expect, it } from "vitest";
import { userMessage } from "../src/lib/safe-error";
import { RateLimited, rateLimit, resetRateLimits } from "../src/lib/rate-limit";

describe("userMessage", () => {
  const quiet = () => {};
  it("passes through messages written for people", () => {
    expect(userMessage(new Error("Only the assignee or a lead can run the review."), quiet)).toBe("Only the assignee or a lead can run the review.");
  });
  it("hides database internals and logs them", () => {
    const logged: string[] = [];
    const msg = userMessage(new Error("\nInvalid `prisma.ticket.update()` invocation in /app/src/x.ts:12\n\nUnique constraint failed on the fields: (`key`)"), (m) => logged.push(m));
    expect(msg).not.toMatch(/prisma|constraint|\/app/i);
    expect(logged).toHaveLength(1);
  });
  it("hides connection errors and stack traces", () => {
    expect(userMessage(new Error("connect ECONNREFUSED 10.0.0.5:5432"), quiet)).not.toMatch(/10\.0\.0\.5/);
    expect(userMessage(new Error("boom\n    at fn (/srv/app.js:1:1)"), quiet)).not.toMatch(/srv/);
  });
  it("handles non-errors", () => { expect(userMessage("x", quiet)).toMatch(/went wrong/); });
});

describe("rateLimit", () => {
  beforeEach(resetRateLimits);
  it("allows up to the limit then blocks, per key", () => {
    for (let i = 0; i < 3; i++) rateLimit("u1", 3, 1000, 100 + i);
    expect(() => rateLimit("u1", 3, 1000, 200)).toThrow(RateLimited);
    expect(() => rateLimit("u2", 3, 1000, 200)).not.toThrow();
  });
  it("recovers once the window has passed", () => {
    for (let i = 0; i < 3; i++) rateLimit("u1", 3, 1000, 100);
    expect(() => rateLimit("u1", 3, 1000, 1200)).not.toThrow();
  });
});
