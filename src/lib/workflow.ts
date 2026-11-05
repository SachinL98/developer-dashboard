// Team workflow: the 10 board columns, forward-only transitions and gates.
export const STATUS_ORDER = [
  "BACKLOG", "READY_TO_DEV", "IN_PROGRESS", "INITIAL_REVIEW", "REVIEW",
  "DEPLOYED_STG", "FAILED_STG", "DOCUMENTED", "DEPLOYED_PROD", "DONE",
] as const;
export type StatusKey = (typeof STATUS_ORDER)[number];

export const STATUS_META: Record<StatusKey, { label: string; color: string; hint: string }> = {
  BACKLOG: { label: "Backlog", color: "#8a94b2", hint: "Ticketed, not yet prioritised for a sprint" },
  READY_TO_DEV: { label: "Ready to Dev", color: "#6ee7ff", hint: "Groomed, estimated, in the sprint" },
  IN_PROGRESS: { label: "In Progress", color: "#a78bfa", hint: "Developer implementing" },
  INITIAL_REVIEW: { label: "Initial Review", color: "#f472b6", hint: "Claude PR review + fixes until clean" },
  REVIEW: { label: "Review", color: "#fbbf24", hint: "Reviewer code review; migrations, seeders, Claude comments" },
  DEPLOYED_STG: { label: "Deployed to Stg", color: "#38bdf8", hint: "On staging, being tested against ticket scope" },
  FAILED_STG: { label: "Failed in Staging", color: "#fb7185", hint: "Staging test failed; goes back to In Progress" },
  DOCUMENTED: { label: "Documented", color: "#34d399", hint: "Staging passed, docs added/updated" },
  DEPLOYED_PROD: { label: "Deployed to Production", color: "#a3e635", hint: "Released; quick production test" },
  DONE: { label: "Done", color: "#4ade80", hint: "Verified in production" },
};

// Backward moves are disabled. The only non-linear edges are around staging.
const NEXT: Record<StatusKey, StatusKey[]> = {
  BACKLOG: ["READY_TO_DEV"],
  READY_TO_DEV: ["IN_PROGRESS"],
  IN_PROGRESS: ["INITIAL_REVIEW"],
  INITIAL_REVIEW: ["REVIEW"],
  REVIEW: ["DEPLOYED_STG"],
  DEPLOYED_STG: ["DOCUMENTED", "FAILED_STG"],
  FAILED_STG: ["IN_PROGRESS"],
  DOCUMENTED: ["DEPLOYED_PROD"],
  DEPLOYED_PROD: ["DONE"],
  DONE: [],
};

export const allowedNext = (s: StatusKey): StatusKey[] => NEXT[s];
export const canMove = (from: StatusKey, to: StatusKey) => NEXT[from].includes(to);

export interface MoveContext {
  assigneeId: string | null;
  sprintId: string | null;
  estimateHrs: number | null;
  storyPoints?: number | null;
  prUrl: string | null;
  initialReviewPassed: boolean;
}

/** Returns an error message when a legal edge is blocked by a team-process gate. */
export function gateError(from: StatusKey, to: StatusKey, c: MoveContext): string | null {
  if (!canMove(from, to)) {
    return `${STATUS_META[from].label} → ${STATUS_META[to].label} is not allowed. Cards only move forward${
      from === "DEPLOYED_STG" ? " (or to Failed in Staging)" : ""
    }.`;
  }
  if (to === "READY_TO_DEV") {
    if (!c.sprintId) return "Add the ticket to a sprint before it is Ready to Dev.";
    if (c.estimateHrs == null && c.storyPoints == null) return "Estimate the ticket before it is Ready to Dev.";
  }
  if (to === "IN_PROGRESS" && from === "READY_TO_DEV" && !c.assigneeId) return "Assign a developer before starting work.";
  if (to === "INITIAL_REVIEW" && !c.prUrl) return "Link the pull request before Initial Review.";
  if (to === "REVIEW" && !c.initialReviewPassed) return "The initial Claude review must pass (all critical items clear) before Review.";
  return null;
}

export const TYPE_META = {
  BUG: { label: "Bug", color: "#fb7185" },
  FEATURE: { label: "Feature", color: "#6ee7ff" },
  ENHANCEMENT: { label: "Enhancement", color: "#a78bfa" },
  TASK: { label: "Task", color: "#8a94b2" },
} as const;

export const PRIORITY_META = {
  CRITICAL: { label: "Critical", color: "#fb7185", weight: 4 },
  HIGH: { label: "High", color: "#fbbf24", weight: 3 },
  MEDIUM: { label: "Medium", color: "#6ee7ff", weight: 2 },
  LOW: { label: "Low", color: "#8a94b2", weight: 1 },
} as const;

export const STORY_POINTS = [1, 2, 3, 5, 8, 13];
export const POKER_HOURS = [1, 2, 4, 6, 8, 12, 16, 24, 40];
export const DONE_STATES: StatusKey[] = ["DEPLOYED_PROD", "DONE"];

/** Rough conversions between the two estimation units (a point ≈ 2.5 hours, matching the poker scale). */
export const pointsForHours = (h: number) => STORY_POINTS.find((p) => h <= p * 2.5) ?? 13;
export const hoursForPoints = (p: number) => Math.round(p * 2.5 * 2) / 2;
