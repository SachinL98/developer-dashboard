// Who may change a meeting's notes, and who an action item's owner is. Pure.
import { atLeast, type AccessLevel } from "./permissions";

/** Leads and admins can always edit. Others only for meetings they attended. When nobody is listed as an attendee we cannot tell, so it stays open. */
export function canEditMeeting(user: { access: AccessLevel; email: string; name: string }, attendees: string[]): boolean {
  if (atLeast(user.access, "LEAD")) return true;
  const list = attendees.map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  const first = user.name.trim().toLowerCase().split(/\s+/)[0];
  return list.some((a) => a === user.email.toLowerCase() || a === user.name.trim().toLowerCase() || a.split("@")[0] === user.email.toLowerCase().split("@")[0] || (first.length > 2 && a === first));
}

/** Match an action item's owner text ("Sam", "Sam Perera", an email) to exactly one person, or null when it is unclear. */
export function resolveOwner(owner: string | null | undefined, people: { id: string; name: string; email: string }[]): string | null {
  const o = (owner ?? "").trim().toLowerCase();
  if (!o) return null;
  const exact = people.filter((p) => p.name.toLowerCase() === o || p.email.toLowerCase() === o);
  if (exact.length === 1) return exact[0].id;
  const first = people.filter((p) => p.name.toLowerCase().split(/\s+/)[0] === o.split(/\s+/)[0]);
  return first.length === 1 && o.split(/\s+/).length === 1 ? first[0].id : null;
}
