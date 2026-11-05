import { describe, expect, it } from "vitest";
import { analyse, categorize, faultsOf, patternSlides, summarise, type ItemLite, type ReviewRow } from "@/lib/patterns";
import { canViewPatterns } from "@/lib/permissions";

const item = (id: string, checked: boolean, note?: string, severity: "critical" | "important" = "important"): ItemLite => ({ id, label: id, severity, checked, note });
let n = 0;
const row = (o: Partial<ReviewRow> & { ticket: string }): ReviewRow => ({
  reviewId: `r${n++}`, ticketId: o.ticket, ticketKey: o.ticket.toUpperCase(), ticketTitle: "t", project: "ATL", developerId: "d1", developer: "Dev One", round: 1,
  at: new Date(2026, 0, 1 + n), passed: false, items: [], findings: [], ...o,
});

describe("categorize and faults", () => {
  it("prefers Claude's category, falls back to keywords", () => {
    expect(categorize({ title: "x", category: "tests" })).toBe("tests");
    expect(categorize({ title: "Missing auth check on new endpoint" })).toBe("security");
    expect(categorize({ title: "Swallowed exception in handler" })).toBe("error-handling");
    expect(categorize({ title: "something odd", category: "bogus" })).toBe("other");
  });
  it("counts failed items and findings once per category, ignoring unassessed items", () => {
    const f = faultsOf({
      items: [item("tests", false), item("errors", true), item("docs", false, "Not assessed by Claude"), item("logging", false, "Claude could not tell from the diff"), item("migrations", false, "adds a column", "critical")],
      findings: [{ severity: "critical", title: "Add test for refund path", category: "tests", file: "a.ts" }],
    });
    expect(f.map((x) => x.category).sort()).toEqual(["migrations", "tests"]);
    expect(f.find((x) => x.category === "tests")).toMatchObject({ severity: "critical", file: "a.ts" });
  });
});

describe("summarise", () => {
  const dirty = [item("tests", false), item("errors", false)];
  it("computes first-try pass rate, rounds and recurring categories", () => {
    const rows = [
      row({ ticket: "a", round: 1, items: dirty }), row({ ticket: "a", round: 2, passed: true }),
      row({ ticket: "b", round: 1, passed: true }),
      row({ ticket: "c", round: 1, items: [item("tests", false)] }), row({ ticket: "c", round: 2, passed: true }),
    ];
    const s = summarise(rows);
    expect(s.tickets).toBe(3); expect(s.enough).toBe(true);
    expect(s.firstTryPassRate).toBeCloseTo(1 / 3); expect(s.avgRounds).toBeCloseTo(1.67, 1);
    expect(s.categories[0]).toMatchObject({ id: "tests", tickets: 2, recurring: true });
    expect(s.categories.find((c) => c.id === "error-handling")!.recurring).toBe(false);
    expect(s.focus.map((f) => f.id)).toEqual(["tests"]);
  });
  it("does not call patterns with too little data", () => {
    const s = summarise([row({ ticket: "a", items: dirty }), row({ ticket: "b", items: dirty })]);
    expect(s.enough).toBe(false); expect(s.focus).toEqual([]); expect(s.trend).toBe("unknown");
  });
  it("detects an improving trend and categories showing up less", () => {
    const s = summarise([row({ ticket: "a", items: [item("tests", false)] }), row({ ticket: "b", items: [item("tests", false)] }), row({ ticket: "c", passed: true }), row({ ticket: "d", passed: true })]);
    expect(s.trend).toBe("improving"); expect(s.categories[0].trend).toBe("less"); expect(s.strengths.join(" ")).toMatch(/less often/);
  });
  it("detects a worsening trend", () => {
    const s = summarise([row({ ticket: "a", passed: true }), row({ ticket: "b", passed: true }), row({ ticket: "c", items: [item("tests", false)] }), row({ ticket: "d", items: [item("tests", false, undefined, "critical")] })]);
    expect(s.trend).toBe("worsening"); expect(s.categories[0].trend).toBe("new");
  });
});

describe("analyse and slides", () => {
  it("separates developers and projects", () => {
    const a = analyse([row({ ticket: "a" }), row({ ticket: "b", developerId: "d2", developer: "Dev Two", project: "ORB" }), row({ ticket: "c", developerId: null, developer: null })]);
    expect(a.devs.map((d) => d.name)).toEqual(["Dev One", "Dev Two"]);
    expect(a.team.tickets).toBe(3); expect(a.byProject.map((p) => p.project)).toEqual(["ATL", "ORB"]);
  });
  it("builds a constructive deck", () => {
    const s = summarise([row({ ticket: "a", items: [item("tests", false)] }), row({ ticket: "b", items: [item("tests", false)] }), row({ ticket: "c", passed: true })]);
    const slides = patternSlides("Review patterns: Dev One", "developer", s);
    expect(slides.map((x) => x.id)).toEqual(expect.arrayContaining(["title", "summary", "focus", "patterns", "next"]));
    const focus = slides.find((x) => x.id === "focus")!;
    expect(focus.layout === "bullets" && focus.bullets[0]).toMatch(/Tests/);
  });
});

describe("visibility", () => {
  it("lets a developer see only their own; leads and admins see everyone and the team", () => {
    const dev = { id: "d1", access: "DEVELOPER" as const };
    expect(canViewPatterns(dev, "d1")).toBe(true); expect(canViewPatterns(dev, "d2")).toBe(false); expect(canViewPatterns(dev, "team")).toBe(false);
    for (const access of ["LEAD", "ADMIN"] as const) { const a = { id: "x", access }; expect(canViewPatterns(a, "d2") && canViewPatterns(a, "team")).toBe(true); }
  });
});
