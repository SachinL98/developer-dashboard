import { describe, expect, it } from "vitest";
import { countdownOf, fmtClock, suggestFinishHours } from "../src/lib/finish-time";

const pt = (points: number, actualHrs: number) => ({ points, actualHrs });

describe("suggestFinishHours", () => {
  it("uses this person's own median for tickets of the same size", () => {
    const s = suggestFinishHours({ points: 3, estimateHrs: null }, [pt(3, 9), pt(3, 11), pt(3, 10), pt(5, 30), pt(1, 2)])!;
    expect(s).toMatchObject({ hours: 10, basis: "personal-same-size", samples: 3 });
    expect(s.note).toContain("3-point");
  });
  it("falls back to their hours per point when there are too few of that size", () => {
    const s = suggestFinishHours({ points: 8, estimateHrs: null }, [pt(2, 6), pt(3, 9), pt(5, 15), pt(1, 3)])!; // 3h per point
    expect(s).toMatchObject({ hours: 24, basis: "personal-per-point", hoursPerPoint: 3 });
  });
  it("uses the team's pace for someone with little history, then the estimate, then a default", () => {
    const team = [pt(2, 5), pt(3, 7.5), pt(5, 12.5), pt(1, 2.5), pt(8, 20)]; // 2.5h per point
    expect(suggestFinishHours({ points: 4, estimateHrs: null }, [pt(2, 4)], team)).toMatchObject({ hours: 10, basis: "team-per-point" });
    expect(suggestFinishHours({ points: 4, estimateHrs: 12 }, [], [])).toMatchObject({ hours: 12, basis: "estimate" });
    expect(suggestFinishHours({ points: 4, estimateHrs: null }, [], [])).toMatchObject({ hours: 10, basis: "default" });
  });
  it("uses the estimate when there are no points, and nothing when there is no information", () => {
    expect(suggestFinishHours({ points: null, estimateHrs: 6 }, [], [])).toMatchObject({ hours: 6, basis: "estimate" });
    expect(suggestFinishHours({ points: null, estimateHrs: null }, [], [])).toBeNull();
  });
  it("rounds to the nearest half hour and ignores tickets with no real time logged", () => {
    expect(suggestFinishHours({ points: 2, estimateHrs: null }, [pt(2, 4.3), pt(2, 4.4), pt(2, 4.2), pt(2, 0)])!.hours).toBe(4.5);
  });
  it("adapts to a slower or faster person", () => {
    const slow = suggestFinishHours({ points: 3, estimateHrs: null }, [pt(3, 14), pt(3, 15), pt(3, 16)])!;
    const fast = suggestFinishHours({ points: 3, estimateHrs: null }, [pt(3, 5), pt(3, 6), pt(3, 6)])!;
    expect(slow.hours).toBeGreaterThan(fast.hours * 2);
  });
});

describe("countdown", () => {
  it("counts down, warns in the last fifth, and shows overrun", () => {
    expect(countdownOf(10, 0)).toMatchObject({ remainingSec: 36000, state: "ok", over: false });
    expect(countdownOf(10, 8.5 * 3600)).toMatchObject({ state: "soon", pctUsed: 85 });
    expect(countdownOf(10, 11 * 3600)).toMatchObject({ state: "over", over: true, remainingSec: -3600 });
  });
  it("formats the clock", () => { expect(fmtClock(3725)).toBe("1h 02m"); expect(fmtClock(125)).toBe("2m 05s"); expect(fmtClock(-90)).toBe("1m 30s"); });
});
