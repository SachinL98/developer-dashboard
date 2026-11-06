import { db } from "./db";
import { getWorkspace } from "./config";
import { matchKind, uniqueMatch } from "./name-match";

export interface JiraPerson { accountId: string; name: string; email?: string; active?: boolean }

/** Placeholder address for a Jira user whose email Jira hides. The `.invalid` domain can never receive mail or be signed up. */
export const placeholderEmail = (accountId: string) => `jira-${accountId.toLowerCase().replace(/[^a-z0-9]/g, "")}@users.jira.invalid`;
export const isPlaceholderEmail = (email: string) => email.endsWith("@users.jira.invalid");
const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

/**
 * Make sure a Jira person exists as a person in the app, so their tickets show with their name even before they ever sign in.
 * Matches by Jira account id, then by email. People who never signed up have no password and cannot log in.
 */
export async function ensureJiraPerson(p: JiraPerson) {
  const email = p.email?.trim().toLowerCase();
  let dev = (await db.developer.findFirst({ where: { jiraAccount: p.accountId } })) ?? (email ? await db.developer.findUnique({ where: { email } }) : null);
  if (dev) {
    const data: { jiraAccount?: string; email?: string; name?: string; active?: boolean } = {};
    if (dev.jiraAccount !== p.accountId) data.jiraAccount = p.accountId;
    if (!dev.passwordHash) {
      // Not signed up yet: Jira is the source of truth for the name, a real email replaces a placeholder, and leaving Jira deactivates them.
      if (p.name && p.name !== dev.name) data.name = p.name;
      if (email && email !== dev.email && isPlaceholderEmail(dev.email) && !(await db.developer.findUnique({ where: { email } }))) data.email = email;
      if (p.active === false && dev.active) data.active = false;
      if (p.active !== false && !dev.active) data.active = true;
    }
    return Object.keys(data).length ? db.developer.update({ where: { id: dev.id }, data }) : dev;
  }
  if (p.active === false) return null;
  // Someone who already has a dashboard account under the same full name (but a different or hidden Jira email) is the same person.
  if (p.name) {
    const same = uniqueMatch(p.name, await db.developer.findMany({ where: { passwordHash: { not: null }, jiraAccount: null } }));
    if (same) return db.developer.update({ where: { id: same.id }, data: { jiraAccount: p.accountId } });
  }
  return db.developer.create({
    data: {
      email: email ?? placeholderEmail(p.accountId), name: p.name || email?.split("@")[0] || "Jira user", jiraAccount: p.accountId, role: "Developer",
      capacityHrs: (await getWorkspace()).defaultCapacityHrs, avatarHue: hue(p.accountId),
    },
  });
}

/** Sync a list of Jira users. Returns how many people were added and how many already existed. */
export async function syncJiraPeople(people: JiraPerson[]) {
  let added = 0, existing = 0;
  for (const p of people) {
    const before = await db.developer.count({ where: { OR: [{ jiraAccount: p.accountId }, ...(p.email ? [{ email: p.email.toLowerCase() }] : [])] } });
    const d = await ensureJiraPerson(p);
    if (d) before ? existing++ : added++;
  }
  return { added, existing };
}

/**
 * Fold a person imported from Jira into their real account: their tickets, time, votes, leave and speaking history move across,
 * the account gets the Jira link, and the duplicate disappears.
 */
export async function mergePeople(fromId: string, intoId: string) {
  if (fromId === intoId) throw new Error("Pick two different people.");
  const [from, into] = await Promise.all([db.developer.findUniqueOrThrow({ where: { id: fromId } }), db.developer.findUniqueOrThrow({ where: { id: intoId } })]);
  if (from.passwordHash) throw new Error("Only a person imported from Jira (who has never signed up) can be merged into an account.");
  if (!into.passwordHash) throw new Error("Merge into a person who has an account.");
  await db.$transaction([
    db.estimateVote.deleteMany({ where: { developerId: from.id, ticketId: { in: (await db.estimateVote.findMany({ where: { developerId: into.id }, select: { ticketId: true } })).map((v) => v.ticketId) } } }),
    db.estimateVote.updateMany({ where: { developerId: from.id }, data: { developerId: into.id } }),
    db.ticket.updateMany({ where: { assigneeId: from.id }, data: { assigneeId: into.id } }),
    db.transition.updateMany({ where: { byId: from.id }, data: { byId: into.id } }),
    db.workSession.updateMany({ where: { developerId: from.id }, data: { developerId: into.id } }),
    db.timeEntry.updateMany({ where: { developerId: from.id }, data: { developerId: into.id } }),
    db.leave.updateMany({ where: { developerId: from.id }, data: { developerId: into.id } }),
    db.meetingSpeaker.updateMany({ where: { developerId: from.id }, data: { developerId: into.id } }),
    db.speakerAlias.updateMany({ where: { developerId: from.id }, data: { developerId: into.id } }),
    db.developer.delete({ where: { id: from.id } }),
    db.developer.update({ where: { id: into.id }, data: { jiraAccount: into.jiraAccount ?? from.jiraAccount } }),
  ]);
  return { tickets: await db.ticket.count({ where: { assigneeId: into.id } }) };
}

type Person = Awaited<ReturnType<typeof db.developer.findMany>>[number];

/**
 * The Jira-imported person this account should be folded into, or null. Never guesses: the account must have exactly one
 * candidate at the strongest level that matches, and that candidate must not fit any other account at that level.
 * Full-name matches win; a first-name-only account ("ishara") matches only when no full-name match exists.
 */
export function pickJiraTwin(account: Person, jiraOnly: Person[], accounts: Person[]): Person | null {
  for (const kind of ["full", "first"] as const) {
    const hits = jiraOnly.filter((j) => matchKind(account.name, j.name) === kind);
    if (hits.length === 0) continue;
    if (hits.length > 1) return null;
    const rivals = accounts.filter((a) => a.id !== account.id && matchKind(a.name, hits[0].name) === kind);
    return rivals.length ? null : hits[0];
  }
  return null;
}

/** Fold every Jira-imported person into their real account when it is clear they are the same person. */
export async function reconcileJiraPeople() {
  const all = await db.developer.findMany();
  let jiraOnly = all.filter((d) => !d.passwordHash && d.jiraAccount);
  const accounts = all.filter((d) => d.passwordHash && !d.jiraAccount);
  let merged = 0;
  for (const acct of accounts) {
    const twin = pickJiraTwin(acct, jiraOnly, accounts);
    if (!twin) continue;
    await mergePeople(twin.id, acct.id);
    jiraOnly = jiraOnly.filter((j) => j.id !== twin.id);
    merged++;
  }
  return { merged };
}

/** Called when someone signs in: if they are not linked to Jira yet, try to find their Jira person. Never throws. */
export async function linkToJiraOnSignIn(userId: string) {
  try {
    const me = await db.developer.findUnique({ where: { id: userId } });
    if (!me || me.jiraAccount || !me.passwordHash) return;
    const all = await db.developer.findMany();
    const twin = pickJiraTwin(me, all.filter((d) => !d.passwordHash && d.jiraAccount), all.filter((d) => d.passwordHash && !d.jiraAccount));
    if (twin) await mergePeople(twin.id, me.id);
  } catch { /* matching is a convenience; signing in must never fail because of it */ }
}
