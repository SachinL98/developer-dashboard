import { describe, expect, it } from "vitest";
import { inSyncWindow, syncDue } from "../src/lib/sync-window";

const TZ = "Asia/Colombo"; // UTC+5:30
describe("inSyncWindow", () => {
  it("is on from 08:30 to 17:30 Sri Lanka time on weekdays", () => {
    expect(inSyncWindow(new Date("2026-11-05T03:00:00Z"), TZ)).toBe(true);  // Thu 08:30
    expect(inSyncWindow(new Date("2026-11-05T12:00:00Z"), TZ)).toBe(true);  // Thu 17:30
    expect(inSyncWindow(new Date("2026-11-05T02:59:00Z"), TZ)).toBe(false); // 08:29
    expect(inSyncWindow(new Date("2026-11-05T12:01:00Z"), TZ)).toBe(false); // 17:31
  });
  it("is off at the weekend", () => {
    expect(inSyncWindow(new Date("2026-11-07T06:00:00Z"), TZ)).toBe(false); // Sat
    expect(inSyncWindow(new Date("2026-11-08T06:00:00Z"), TZ)).toBe(false); // Sun
  });
});
describe("syncDue", () => {
  const now = new Date("2026-11-05T06:00:00Z");
  it("runs when never synced or 5 minutes have passed", () => {
    expect(syncDue(null, now)).toBe(true);
    expect(syncDue("2026-11-05T05:55:10Z", now)).toBe(true);
  });
  it("waits when it ran recently", () => { expect(syncDue("2026-11-05T05:58:00Z", now)).toBe(false); });
});
