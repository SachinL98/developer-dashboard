import { describe, expect, it } from "vitest";
import { linkBugs, qualityStats, tokens, type QTicket } from "../src/lib/quality-calc";

const d = (s: string) => new Date(`${s}T10:00:00Z`);
const t = (o: Partial<QTicket> & { key: string; title: string }): QTicket => ({
  description: "", type: "FEATURE", priority: "MEDIUM", labels: [], projectId: "p", sprintId: "s1", sprintName: "Sprint 1", sprintOrder: 0, assigneeId: "ann",
  createdAt: d("2026-09-01"), doneAt: d("2026-09-10"), ...o,
});

const pim = t({ key: "A-1", title: "PIM public view product page", description: "Show the public product catalogue view for visitors", labels: ["pim"], assigneeId: "ann" });
const other = t({ key: "A-2", title: "Invoice export to CSV", assigneeId: "bob", description: "Export invoices as csv files" });
const bug = (o: Partial<QTicket> = {}) => t({ key: "A-9", title: "PIM public view shows wrong product price", type: "BUG", labels: ["pim"], createdAt: d("2026-10-05"), doneAt: null, assigneeId: "cat", sprintName: "Sprint 3", sprintOrder: 2, ...o });

describe("tokens", () => { it("drops filler words and short tokens", () => { expect(tokens("Fix the bug in PIM page 12")).toEqual(["pim"]); }); });

describe("linkBugs", () => {
  it("traces a later bug to the earlier ticket in the same area", () => {
    const [l] = linkBugs([pim, other, bug()]);
    expect(l.candidates[0].origin.key).toBe("A-1");
    expect(l.candidates.find((c) => c.origin.key === "A-2")).toBeUndefined();
    expect(l.candidates[0].signals.map((s) => s.kind)).toEqual(expect.arrayContaining(["labels", "wording"]));
  });
  it("treats a named ticket key as strong evidence", () => {
    const [l] = linkBugs([pim, other, bug({ title: "Wrong price", description: "Regression from A-2 export" })]);
    expect(l.candidates[0].origin.key).toBe("A-2");
    expect(l.candidates[0].signals[0].kind).toBe("mentioned");
  });
  it("ignores work finished after the bug appeared, other projects and unfinished work", () => {
    const later = t({ key: "A-3", title: "PIM public view price", doneAt: d("2026-10-20"), labels: ["pim"] });
    const elsewhere = t({ key: "B-1", title: "PIM public view product page", labels: ["pim"], projectId: "q" });
    const open = t({ key: "A-4", title: "PIM public view product page", labels: ["pim"], doneAt: null });
    expect(linkBugs([later, elsewhere, open, bug()])[0].candidates).toHaveLength(0);
  });
  it("returns no candidate when nothing relates", () => {
    expect(linkBugs([other, bug({ title: "Login button misaligned", labels: [], description: "" })])[0].candidates).toHaveLength(0);
  });
});

describe("qualityStats", () => {
  it("counts bugs per developer and compares with the team", () => {
    const feats = ["a", "b", "c", "d"].map((k, i) => t({ key: `F-${i}`, title: `Pricing rules ${k}`, assigneeId: i < 2 ? "ann" : "bob", labels: ["pricing"], description: "pricing rules engine" }));
    const bugs = [1, 2, 3].map((n) => bug({ key: `X-${n}`, title: "Pricing rules wrong total", labels: ["pricing"], description: "pricing rules engine total" }));
    const tickets = [...feats, ...bugs];
    const s = qualityStats(tickets, linkBugs(tickets));
    expect(s.bugsTotal).toBe(3);
    expect(s.bugsTraced).toBe(3);
    expect(s.perDev.find((x) => x.developerId === "ann")!.delivered).toBe(2);
    expect(s.teamBugsPer10).toBe(7.5);
  });
  it("treats 1 or 2 bugs as normal and only repetition across sprints as a pattern", () => {
    const feat = (k: string, who: string) => t({ key: k, title: "Pricing rules engine", assigneeId: who, labels: ["pricing"], description: "pricing rules engine totals" });
    const pb = (n: number, sprint: string) => bug({ key: `P-${n}`, title: "Pricing rules engine wrong total", labels: ["pricing"], description: "pricing rules engine totals", sprintName: sprint });
    const few = [feat("F1", "ann"), feat("F2", "ann"), feat("F3", "ann"), pb(1, "Sprint 3"), pb(2, "Sprint 3")];
    expect(qualityStats(few, linkBugs(few)).perDev.find((x) => x.developerId === "ann")!.pattern).toBe("occasional");
    const many = [feat("F1", "ann"), feat("F2", "ann"), feat("F3", "ann"), pb(1, "Sprint 3"), pb(2, "Sprint 4"), pb(3, "Sprint 5")];
    const s = qualityStats(many, linkBugs(many));
    expect(s.perDev.find((x) => x.developerId === "ann")!.pattern).toBe("recurring");
    expect(s.recurringAreas.length).toBeGreaterThan(0);
    const none = [feat("F1", "bob")];
    expect(qualityStats(none, linkBugs(none)).perDev[0].pattern).toBe("none");
  });
});

describe("linkBugs: Jira links and confirmed answers", () => {
  it("uses a Jira link as strong evidence even when the wording differs", () => {
    const linked = bug({ title: "Wrong total", description: "", labels: [], links: [{ type: "is caused by", direction: "in", key: "A-2" }] });
    const c = linkBugs([pim, other, linked])[0].candidates;
    expect(c[0].origin.key).toBe("A-2");
    expect(c[0].signals[0].kind).toBe("linked");
    expect(c[0].confidence).toBe("likely");
  });
  it("a person's confirmed answer beats every guess", () => {
    const [l] = linkBugs([pim, other, bug()], { confirmed: new Map([["A-9", "A-2"]]) });
    expect(l.candidates).toHaveLength(1);
    expect(l.candidates[0].origin.key).toBe("A-2");
    expect(l.candidates[0].signals[0].kind).toBe("confirmed");
  });
});

import { qualitySlides } from "../src/lib/quality-slides";
describe("qualitySlides", () => {
  it("shows a developer only their own row and bugs", () => {
    const f = (k: string, who: string) => t({ key: k, title: "Pricing rules engine", assigneeId: who, labels: ["pricing"], description: "pricing rules engine totals" });
    const tix = [f("F1", "ann"), f("F2", "bob"), bug({ key: "P-1", title: "Pricing rules engine wrong total", labels: ["pricing"], description: "pricing rules engine totals" })];
    const links = linkBugs(tix); const stats = qualityStats(tix, links);
    const names = new Map([["ann", "Ann"], ["bob", "Bob"]]);
    const mine = qualitySlides(stats, links, names, undefined, { all: false, viewerId: "ann" });
    const people = mine.find((s) => s.id === "people");
    expect(people && "rows" in people ? people.rows.map((r) => r[0]) : []).toEqual(["Ann"]);
    const all = qualitySlides(stats, links, names, undefined, { all: true, viewerId: "x" });
    const rows = all.find((s) => s.id === "people");
    expect(rows && "rows" in rows ? rows.rows.length : 0).toBe(2);
  });
});
