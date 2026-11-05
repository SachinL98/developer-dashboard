import { describe, expect, it } from "vitest";
import { STATUS_ORDER, allowedNext, canMove, gateError } from "../src/lib/workflow";

const ctx = { assigneeId: "d1", sprintId: "s1", estimateHrs: 4, prUrl: "https://github.com/o/r/pull/1", initialReviewPassed: true };

describe("board workflow", () => {
  it("has the 10 team columns in order", () => {
    expect(STATUS_ORDER).toEqual(["BACKLOG", "READY_TO_DEV", "IN_PROGRESS", "INITIAL_REVIEW", "REVIEW", "DEPLOYED_STG", "FAILED_STG", "DOCUMENTED", "DEPLOYED_PROD", "DONE"]);
  });
  it("only allows forward moves, plus the staging failure loop", () => {
    expect(allowedNext("BACKLOG")).toEqual(["READY_TO_DEV"]);
    expect(allowedNext("DEPLOYED_STG").sort()).toEqual(["DOCUMENTED", "FAILED_STG"]);
    expect(allowedNext("FAILED_STG")).toEqual(["IN_PROGRESS"]);
    expect(allowedNext("DONE")).toEqual([]);
  });
  it("never allows moving backwards or skipping columns", () => {
    for (const from of STATUS_ORDER) for (const to of STATUS_ORDER) {
      if (from === "FAILED_STG" && to === "IN_PROGRESS") continue;
      if (STATUS_ORDER.indexOf(to) <= STATUS_ORDER.indexOf(from)) expect(canMove(from, to)).toBe(false);
    }
    expect(canMove("IN_PROGRESS", "REVIEW")).toBe(false);
    expect(canMove("REVIEW", "DOCUMENTED")).toBe(false); // must pass through staging
  });
  it("gates: sprint + estimate before Ready, assignee before work, PR before review, Claude review before Review", () => {
    expect(gateError("BACKLOG", "READY_TO_DEV", { ...ctx, sprintId: null })).toMatch(/sprint/i);
    expect(gateError("BACKLOG", "READY_TO_DEV", { ...ctx, estimateHrs: null })).toMatch(/estimate/i);
    expect(gateError("READY_TO_DEV", "IN_PROGRESS", { ...ctx, assigneeId: null })).toMatch(/assign/i);
    expect(gateError("IN_PROGRESS", "INITIAL_REVIEW", { ...ctx, prUrl: null })).toMatch(/pull request/i);
    expect(gateError("INITIAL_REVIEW", "REVIEW", { ...ctx, initialReviewPassed: false })).toMatch(/claude review/i);
    expect(gateError("INITIAL_REVIEW", "REVIEW", ctx)).toBeNull();
    expect(gateError("FAILED_STG", "IN_PROGRESS", { ...ctx, assigneeId: null })).toBeNull();
  });
  it("explains illegal moves", () => {
    expect(gateError("REVIEW", "IN_PROGRESS", ctx)).toMatch(/not allowed/);
  });
});
