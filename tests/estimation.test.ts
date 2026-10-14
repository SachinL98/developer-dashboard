import { describe, expect, it } from "vitest";
import { fillSprint, sprintFit, suggestEstimate, summarisePoker } from "../src/lib/estimation";

const hist = (n: number, hrs: number, type = "BUG", points = 3) => Array.from({ length: n }, () => ({ type, points, estimateHrs: hrs, actualHrs: hrs }));

describe("estimation", () => {
  it("uses the median of similar finished tickets", () => {
    const s = suggestEstimate({ type: "BUG", points: 3 }, [...hist(4, 6), ...hist(2, 20)]);
    expect(s.hours).toBe(6);
    expect(s.confidence).toBe("high");
  });
  it("falls back to hours per point, then to 3h/pt", () => {
    expect(suggestEstimate({ type: "FEATURE", points: 5 }, hist(5, 8, "BUG", 2)).basis).toMatch(/per story point/);
    expect(suggestEstimate({ type: "FEATURE", points: 2 }, []).hours).toBe(6);
  });
  it("inflates complicated tickets", () => {
    const base = suggestEstimate({ type: "BUG", points: 3 }, hist(6, 8)).hours;
    expect(suggestEstimate({ type: "BUG", points: 3, complicated: true }, hist(6, 8)).hours).toBeGreaterThan(base);
  });
  it("summarises poker votes", () => {
    expect(summarisePoker([4, 4, 6]).consensus).toBe(true);
    expect(summarisePoker([2, 8, 16]).consensus).toBe(false);
    expect(summarisePoker([2, 4, 8]).median).toBe(4);
  });
  it("checks sprint fit with a buffer", () => {
    expect(sprintFit(100, [40, 40]).fits).toBe(true); // 85h usable
    const f = sprintFit(100, [50, 50]);
    expect(f.fits).toBe(false);
    expect(f.overBy).toBe(15);
  });
  it("fills the sprint in priority order, skipping oversize items", () => {
    const r = fillSprint([{ id: "a", estimateHrs: 30 }, { id: "b", estimateHrs: 60 }, { id: "c", estimateHrs: 20 }], 100);
    expect(r.take.map((t) => t.id)).toEqual(["a", "c"]);
    expect(r.leave.map((t) => t.id)).toEqual(["b"]);
  });
});
