import { describe, expect, it } from "vitest";
import { buildSlides, pctChange, previousPeriod, resolvePeriod, risksFor, type ReportFacts, type SprintLite } from "@/lib/report";

const TZ = "Asia/Colombo";
const now = new Date("2026-10-14T08:00:00Z"); // a Wednesday
const sprint = (id: string, state: string, s: string, e: string): SprintLite => ({ id, name: id, state, startDate: new Date(s), endDate: new Date(e) });

describe("resolvePeriod", () => {
  it("previous week is the last full Monday to Sunday", () => {
    const p = resolvePeriod("week", undefined, now, [], TZ)!;
    expect(p.key).toBe("week:2026-10-05");
    expect(p.end.getTime() - p.start.getTime()).toBe(7 * 86_400_000);
    expect(p.label).toBe("5 Oct to 11 Oct");
  });
  it("previous month handles January rollover", () => {
    expect(resolvePeriod("month", undefined, now, [], TZ)!.key).toBe("month:2026-09");
    expect(resolvePeriod("month", undefined, new Date("2026-01-10T00:00:00Z"), [], TZ)!.key).toBe("month:2025-12");
  });
  it("previous sprint is the latest closed one, or the explicit ref", () => {
    const ss = [sprint("a", "CLOSED", "2026-08-01", "2026-08-14"), sprint("b", "CLOSED", "2026-08-15", "2026-08-28"), sprint("c", "ACTIVE", "2026-08-29", "2026-09-11")];
    expect(resolvePeriod("sprint", undefined, now, ss, TZ)!.sprintId).toBe("b");
    expect(resolvePeriod("sprint", "a", now, ss, TZ)!.sprintId).toBe("a");
    expect(resolvePeriod("sprint", undefined, now, [], TZ)).toBeNull();
  });
  it("previousPeriod steps back one of the same kind", () => {
    const w = resolvePeriod("week", undefined, now, [], TZ)!;
    expect(previousPeriod(w, now, [], TZ)!.key).toBe("week:2026-09-28");
    const m = resolvePeriod("month", undefined, now, [], TZ)!;
    expect(previousPeriod(m, now, [], TZ)!.key).toBe("month:2026-08");
  });
});

const stats = { points: 20, tickets: 5, loggedHrs: 80, bugsFixed: 1, bugsOpened: 3, stgDeploys: 4, stgFailures: 2, cycleDays: 4 };
const facts = (over: Partial<ReportFacts> = {}): ReportFacts => ({
  period: resolvePeriod("week", undefined, now, [], TZ)!, now, tz: TZ, stats, prev: { ...stats, points: 30 }, prevLabel: "last week", committedPts: null,
  buckets: [{ label: "Mon", points: 5, hours: 10 }], bucketUnit: "day", velocity: [], delivered: [], devs: [], carry: [], estimateAccuracy: null, stale: [], reviewBlocked: 0,
  decisions: [], openActions: [], nextSprint: null, nextMonth: { label: "November 2026", capacityHrs: 100, candidates: [], plannedHrs: 0, plannedPts: 0, backlogCount: 0, carryPts: 0 }, notes: {}, ...over,
});

describe("report slides", () => {
  it("pctChange avoids dividing by zero", () => {
    expect(pctChange(10, 0)).toBeNull(); expect(pctChange(0, 0)).toBe(0); expect(pctChange(15, 10)).toBe(50); expect(pctChange(5, null)).toBeNull();
  });
  it("includes both plans and attaches commentary", () => {
    const slides = buildSlides(facts({ notes: { headline: "Nice week" } }));
    const ids = slides.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(["title", "headline", "shipped", "people", "risks", "next-sprint", "next-month", "close"]));
    expect(slides.find((s) => s.id === "headline")!.note).toBe("Nice week");
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("flags risks from the numbers", () => {
    const r = risksFor(facts({ reviewBlocked: 2 })).join("\n");
    expect(r).toMatch(/dropped 33%/); expect(r).toMatch(/2 staging failure/); expect(r).toMatch(/bugs were opened/); expect(r).toMatch(/blocked by a failing/); expect(r).toMatch(/No next sprint/);
  });
  it("flags an over-committed sprint and low delivery", () => {
    const r = risksFor(facts({ committedPts: 40, prev: null, nextSprint: { name: "S2", goal: null, start: now, end: now, state: "PLANNING", rows: [], committedHrs: 120, capacityHrs: 100, loadPct: 120, unestimated: 2, unassigned: 1 } })).join("\n");
    expect(r).toMatch(/Only 50% of the committed 40/); expect(r).toMatch(/over capacity by 20h/); expect(r).toMatch(/2 card\(s\) in S2 still have no estimate/);
  });
});
