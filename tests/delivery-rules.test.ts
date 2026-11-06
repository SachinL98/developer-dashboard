import { describe, expect, it } from "vitest";
import { sprintHealth, sprintRiskReasons, workdaysSince, stuckTickets, calibration } from "../src/lib/delivery-rules";

const d = (s: string) => new Date(`${s}T10:00:00Z`);
describe("sprintHealth", () => {
  it("compares done share with time used", () => {
    expect(sprintHealth(50, 55).level).toBe("on_track");
    expect(sprintHealth(30, 50).level).toBe("at_risk");
    expect(sprintHealth(10, 70).level).toBe("behind");
  });
  it("lists only real reasons", () => {
    expect(sprintRiskReasons({ donePct: 60, elapsedPct: 55, daysLeft: 4, blocked: 0, stuck: 0, unestimated: 0, failedStaging: 0 })).toEqual([]);
    const r = sprintRiskReasons({ donePct: 20, elapsedPct: 60, daysLeft: 3, blocked: 2, stuck: 1, unestimated: 0, failedStaging: 1 });
    expect(r).toHaveLength(4); expect(r[0]).toMatch(/20% of tickets are done/);
  });
});
describe("workdaysSince / stuckTickets", () => {
  it("skips weekends", () => {
    expect(workdaysSince(d("2026-11-06"), d("2026-11-09"))).toBe(1); // Fri -> Mon
    expect(workdaysSince(d("2026-11-02"), d("2026-11-05"))).toBe(3);
  });
  it("flags review and staging waits of 2+ working days only", () => {
    const now = d("2026-11-05");
    const list = stuckTickets([
      { key: "A-1", title: "x", status: "REVIEW", assigneeId: "a", since: d("2026-11-02") },
      { key: "A-2", title: "y", status: "REVIEW", assigneeId: "a", since: d("2026-11-05") },
      { key: "A-3", title: "z", status: "IN_PROGRESS", assigneeId: "a", since: d("2026-10-01") },
    ], now);
    expect(list.map((t) => t.key)).toEqual(["A-1"]);
  });
});
describe("calibration", () => {
  it("shows when work usually takes longer than estimated", () => {
    const c = calibration([{ points: 3, estimateHrs: 6, actualHrs: 9 }, { points: 3, estimateHrs: 6, actualHrs: 8 }, { points: 5, estimateHrs: 10, actualHrs: 14 }]);
    expect(c.bias).toBe("under"); expect(c.rows[0]).toMatchObject({ points: 3, tickets: 2 });
  });
  it("needs a few tickets", () => { expect(calibration([{ points: 3, estimateHrs: 6, actualHrs: 9 }]).bias).toBe("not enough data"); });
});
