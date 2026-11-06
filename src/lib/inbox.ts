import { db } from "./db";

export interface InboxItem { kind: string; title: string; body?: string; href?: string }

/** Put a message in someone's in-app inbox (the bell). Best effort: it never blocks the thing that caused it. */
export async function notifyInbox(userId: string, item: InboxItem): Promise<void> {
  try { await db.notification.create({ data: { userId, kind: item.kind, title: item.title.slice(0, 160), body: item.body?.slice(0, 400) ?? null, href: item.href ?? null } }); } catch { /* the inbox is a convenience */ }
}
export async function notifyInboxMany(userIds: string[], item: InboxItem): Promise<void> {
  for (const id of [...new Set(userIds)]) await notifyInbox(id, item);
}
