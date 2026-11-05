import { db } from "./db";
import { DONE_STATES } from "./workflow";
import { sumEntries } from "./analytics";
import { hours } from "./time";
import type { PacePoint } from "./finish-time";

/** Finished, pointed tickets with the hours actually logged: the person's own, and the whole team's. Loaded once per page. */
export async function loadPaceHistory(devId: string | null): Promise<{ mine: PacePoint[]; team: PacePoint[] }> {
  const rows = await db.ticket.findMany({ where: { status: { in: DONE_STATES as any }, storyPoints: { gt: 0 } }, select: { assigneeId: true, storyPoints: true, timeEntries: { select: { startedAt: true, endedAt: true } } }, orderBy: { doneAt: "desc" }, take: 600 });
  const all = rows.map((r) => ({ assigneeId: r.assigneeId, points: r.storyPoints!, actualHrs: hours(sumEntries(r.timeEntries)) }));
  return { mine: devId ? all.filter((r) => r.assigneeId === devId) : [], team: all };
}
