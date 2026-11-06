import { db } from "./db";

/** Record an admin action. Best effort: a failure to write the log never blocks the action itself. */
export async function audit(actor: { id: string; name: string } | null, action: string, target?: string | null, detail?: unknown): Promise<void> {
  try {
    await db.auditLog.create({ data: { actorId: actor?.id ?? null, actorName: actor?.name ?? "system", action, target: target ?? null, ...(detail !== undefined ? { detail: detail as never } : {}) } });
  } catch { /* the log is a convenience, not a gate */ }
}
