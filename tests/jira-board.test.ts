import { describe, expect, it } from "vitest";
import { statusFromJira, parseIssue, type JiraBoardInfo } from "../src/lib/integrations/jira";
import { columnIdFor, jiraColumns, workflowColumns } from "../src/lib/board-columns";
import { gateError, hoursForPoints, pointsForHours } from "../src/lib/workflow";

const info: JiraBoardInfo = {
  boardId: "1", fetchedAt: new Date().toISOString(), estimation: { mode: "points", field: "customfield_10016" },
  columns: [
    { name: "To Do", statuses: [{ id: "1", name: "To Do", category: "new" }, { id: "2", name: "Ready to Dev", category: "new" }] },
    { name: "Doing", statuses: [{ id: "3", name: "In Progress", category: "indeterminate" }] },
    { name: "Code review", statuses: [{ id: "4", name: "Initial Review", category: "indeterminate" }, { id: "5", name: "Review", category: "indeterminate" }] },
    { name: "Shipped", statuses: [{ id: "6", name: "Shipped to prod", category: "done" }] },
  ],
};

describe("status mapping", () => {
  it("prefers admin overrides, then names, then Jira's category", () => {
    expect(statusFromJira("Shipped to prod", {}, "done")).toBe("DEPLOYED_PROD");
    expect(statusFromJira("QA", { QA: "DEPLOYED_STG" })).toBe("DEPLOYED_STG");
    expect(statusFromJira("Blocked-ish", {}, "indeterminate")).toBe("IN_PROGRESS");
    expect(statusFromJira("Mystery", {})).toBeNull();
    expect(statusFromJira("Failed in Staging")).toBe("FAILED_STG");
  });
});

describe("real board columns", () => {
  const cols = jiraColumns(info, {});
  it("keeps Jira's column names and maps each to workflow statuses", () => {
    expect(cols.map((c) => c.label)).toEqual(["To Do", "Doing", "Code review", "Shipped"]);
    expect(cols[2].statuses).toEqual(["INITIAL_REVIEW", "REVIEW"]);
  });
  it("places a card by its Jira status, else by workflow status", () => {
    expect(columnIdFor({ status: "IN_PROGRESS", jiraStatus: "Review" }, cols)).toBe("jira:Code review");
    expect(columnIdFor({ status: "READY_TO_DEV", jiraStatus: null }, cols)).toBe("jira:To Do");
  });
  it("adds a Backlog column when no Jira column holds backlog", () => {
    const c = jiraColumns({ ...info, columns: info.columns.slice(1) }, {});
    expect(c[0].label).toBe("Backlog");
  });
  it("falls back to the 10 workflow columns", () => expect(workflowColumns()).toHaveLength(10));
});

describe("estimates", () => {
  it("accepts story points as an estimate at the Ready gate", () => {
    const ctx = { assigneeId: null, sprintId: "s", estimateHrs: null, storyPoints: 5, prUrl: null, initialReviewPassed: true };
    expect(gateError("BACKLOG", "READY_TO_DEV", ctx)).toBeNull();
    expect(gateError("BACKLOG", "READY_TO_DEV", { ...ctx, storyPoints: null })).toMatch(/Estimate/);
  });
  it("converts between points and hours consistently", () => {
    expect(pointsForHours(hoursForPoints(5))).toBe(5);
  });
  it("parses a webhook issue payload", () => {
    const i = parseIssue({ key: "ATL-1", fields: { summary: "x", issuetype: { name: "Bug" }, priority: { name: "High" }, status: { name: "In Progress", statusCategory: { key: "indeterminate" } }, customfield_10016: 3, timeoriginalestimate: 7200, labels: ["a"] } });
    expect(i).toMatchObject({ key: "ATL-1", type: "BUG", priority: "HIGH", points: 3, estimateHrs: 2, statusCategory: "indeterminate" });
  });
});
