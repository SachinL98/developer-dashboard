import { STATUS_META, STATUS_ORDER, type StatusKey } from "./workflow";
import { statusFromJira, type JiraBoardInfo, type StatusMap } from "./integrations/jira";

/** A board column: either one of our workflow statuses, or a real Jira board column holding the workflow statuses it maps to. */
export interface BoardColumn {
  id: string; label: string; color: string; hint?: string;
  statuses: StatusKey[]; // workflow statuses a card dropped here can take
  jiraStatuses: string[]; // the Jira status names shown in this column
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const CATEGORY_COLOR: Record<string, string> = { new: "#8a94b2", indeterminate: "#6ee7ff", done: "#a3e635" };

export const workflowColumns = (): BoardColumn[] =>
  STATUS_ORDER.map((s) => ({ id: s, label: STATUS_META[s].label, color: STATUS_META[s].color, hint: STATUS_META[s].hint, statuses: [s], jiraStatuses: [] }));

/** The real Jira board's columns, each mapped to the workflow statuses of the statuses it contains. */
export function jiraColumns(info: JiraBoardInfo, map: StatusMap): BoardColumn[] {
  const cols: BoardColumn[] = info.columns.map((c) => {
    const statuses = [...new Set(c.statuses.map((s) => statusFromJira(s.name, map, s.category)).filter((k): k is StatusKey => !!k))];
    return {
      id: "jira:" + c.name, label: c.name, color: CATEGORY_COLOR[c.statuses[0]?.category ?? ""] ?? "#6ee7ff",
      hint: statuses.length ? `Workflow: ${statuses.map((k) => STATUS_META[k].label).join(", ")}` : "No workflow status mapped — map this column's Jira statuses in Integrations to move cards here",
      statuses, jiraStatuses: c.statuses.map((s) => s.name),
    };
  });
  // Backlog items normally sit outside the board's columns: give them their own leading column.
  if (!cols.some((c) => c.statuses.includes("BACKLOG")))
    cols.unshift({ id: "jira:__backlog", label: "Backlog", color: "#8a94b2", hint: "Not on the Jira board yet", statuses: ["BACKLOG"], jiraStatuses: [] });
  return cols;
}

/** Which column a ticket belongs in: its real Jira status first, then its workflow status. */
export function columnIdFor(t: { status: StatusKey; jiraStatus: string | null }, columns: BoardColumn[]): string {
  if (t.jiraStatus) {
    const hit = columns.find((c) => c.jiraStatuses.some((n) => norm(n) === norm(t.jiraStatus!)));
    if (hit) return hit.id;
  }
  return (columns.find((c) => c.statuses.includes(t.status)) ?? columns[0]).id;
}
