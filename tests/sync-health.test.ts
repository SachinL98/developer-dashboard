import { describe, expect, it } from "vitest";
import { recordSync, failingMinutes, ALERT_AFTER_MIN } from "../src/lib/sync-health";

const t = (m: number) => new Date(Date.UTC(2026, 10, 5, 4, 0) + m * 60_000);
describe("sync health", () => {
  it("starts failing on the first error and keeps that start time", () => {
    const a = recordSync(null, false, "401 Unauthorized", t(0));
    const b = recordSync(a, false, "401 Unauthorized", t(30));
    expect(b.failingSince).toBe(a.failingSince);
    expect(failingMinutes(b, t(75))).toBe(75);
    expect(failingMinutes(b, t(75))).toBeGreaterThanOrEqual(ALERT_AFTER_MIN);
  });
  it("clears on a success", () => {
    const a = recordSync(null, false, "boom", t(0));
    const ok = recordSync(a, true, undefined, t(10));
    expect(failingMinutes(ok, t(90))).toBe(0);
    expect(ok.failingSince).toBeUndefined();
  });
});
