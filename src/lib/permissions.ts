// Role rules, kept free of DB/Next imports so they can be unit tested.
import type { StatusKey } from "./workflow";

export type AccessLevel = "DEVELOPER" | "LEAD" | "ADMIN";
const RANK: Record<AccessLevel, number> = { DEVELOPER: 1, LEAD: 2, ADMIN: 3 };
export const atLeast = (a: AccessLevel, min: AccessLevel) => RANK[a] >= RANK[min];

export interface Actor { id: string; access: AccessLevel }

/** Columns a developer may move their own cards into. Staging/production steps belong to leads and admins. */
const DEV_TARGETS: StatusKey[] = ["IN_PROGRESS", "INITIAL_REVIEW", "REVIEW"];

export function canMoveTicket(actor: Actor, ticket: { assigneeId: string | null }, to: StatusKey): boolean {
  if (atLeast(actor.access, "LEAD")) return true;
  return ticket.assigneeId === actor.id && DEV_TARGETS.includes(to);
}

export type TicketPatchKey = "assigneeId" | "storyPoints" | "estimateHrs" | "prUrl" | "complicated" | "priority" | "title" | "description";
const LEAD_ONLY_FIELDS: TicketPatchKey[] = ["assigneeId", "priority"];

/** Developers can edit their own tickets (not reassign/reprioritise); leads and admins can edit anything. */
export function canPatchTicket(actor: Actor, ticket: { assigneeId: string | null }, fields: string[]): boolean {
  if (atLeast(actor.access, "LEAD")) return true;
  if (fields.some((f) => (LEAD_ONLY_FIELDS as string[]).includes(f))) return false;
  return ticket.assigneeId === actor.id || ticket.assigneeId === null;
}

/** Emails that always get ADMIN on first sign-in (comma separated env). */
export const bootstrapAdmins = () => (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const allowedDomain = () => (process.env.AUTH_ALLOWED_DOMAIN || "spaceitlabs.com").toLowerCase();

export function emailAllowed(email: string | undefined | null): boolean {
  if (!email) return false;
  const m = email.toLowerCase().match(/^[^@\s]+@([^@\s]+)$/);
  return !!m && m[1] === allowedDomain();
}
