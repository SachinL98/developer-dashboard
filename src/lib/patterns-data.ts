import { db } from "./db";
import { analyse, type Analysis, type Finding, type ItemLite, type ReviewRow } from "./patterns";

/** Completed Claude reviews of the last year as plain rows. Heuristic scans and manual checklists are left out. */
export async function loadReviewRows(): Promise<ReviewRow[]> {
  const since = new Date(Date.now() - 365 * 86_400_000);
  const rows = await db.prReview.findMany({
    where: { kind: "INITIAL_CLAUDE", status: "DONE", source: "claude", createdAt: { gte: since } },
    include: { ticket: { include: { project: true, assignee: true } } }, orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    reviewId: r.id, ticketId: r.ticketId, ticketKey: r.ticket.key, ticketTitle: r.ticket.title, project: r.ticket.project.key,
    developerId: r.ticket.assigneeId, developer: r.ticket.assignee?.name ?? null, round: r.round, at: r.createdAt, passed: r.passed,
    items: (Array.isArray(r.items) ? r.items : []) as unknown as ItemLite[], findings: (Array.isArray(r.findings) ? r.findings : []) as unknown as Finding[],
  }));
}

export async function loadAnalysis(): Promise<Analysis> { return analyse(await loadReviewRows()); }
