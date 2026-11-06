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
});
