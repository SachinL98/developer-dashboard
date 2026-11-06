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
 * Fold a duplicate person into the one to keep: their tickets, time, votes, leave, notifications, photo, connections and
 * speaking history move across, any Jira/GitHub/Google/Discord link the kept one lacks is carried over, and the duplicate is removed.
 * The record the HR app owns always survives: it carries the email people sign in with.
 */
export async function mergePeople(fromId: string, intoId: string) {
  if (fromId === intoId) throw new Error("Pick two different people.");
  const [from, into] = await Promise.all([db.developer.findUniqueOrThrow({ where: { id: fromId } }), db.developer.findUniqueOrThrow({ where: { id: intoId } })]);
  if (from.hrManaged) throw new Error(into.hrManaged ? "Both are people in the HR app, so they are different people." : `"${from.name}" is owned by the HR app. Merge the other entry into it instead.`);

  await db.$transaction(async (tx) => {
    const voted = (await tx.estimateVote.findMany({ where: { developerId: into.id }, select: { ticketId: true } })).map((v) => v.ticketId);
    await tx.estimateVote.deleteMany({ where: { developerId: from.id, ticketId: { in: voted } } });
    await tx.estimateVote.updateMany({ where: { developerId: from.id }, data: { developerId: into.id } });
    await tx.ticket.updateMany({ where: { assigneeId: from.id }, data: { assigneeId: into.id } });
    await tx.transition.updateMany({ where: { byId: from.id }, data: { byId: into.id } });
    await tx.workSession.updateMany({ where: { developerId: from.id }, data: { developerId: into.id } });
    await tx.timeEntry.updateMany({ where: { developerId: from.id }, data: { developerId: into.id } });
    await tx.leave.updateMany({ where: { developerId: from.id }, data: { developerId: into.id } });
    await tx.leave.updateMany({ where: { decidedById: from.id }, data: { decidedById: into.id } });
    await tx.meetingSpeaker.updateMany({ where: { developerId: from.id }, data: { developerId: into.id } });
    await tx.speakerAlias.updateMany({ where: { developerId: from.id }, data: { developerId: into.id } });
    await tx.notification.updateMany({ where: { userId: from.id }, data: { userId: into.id } });
    await tx.notificationLog.deleteMany({ where: { userId: from.id } }); // one-per-day markers: the kept person's own are enough
    await tx.auditLog.updateMany({ where: { actorId: from.id }, data: { actorId: into.id } });
    await tx.aiInsight.updateMany({ where: { createdById: from.id }, data: { createdById: into.id } });
    await tx.bugOrigin.updateMany({ where: { confirmedById: from.id }, data: { confirmedById: into.id } });
    // Connections (Jira, Google, ...): keep the kept person's, hand over the providers they do not have.
    const have = new Set((await tx.connection.findMany({ where: { userId: into.id }, select: { provider: true } })).map((c) => c.provider));
    for (const c of await tx.connection.findMany({ where: { userId: from.id } })) if (!have.has(c.provider)) await tx.connection.update({ where: { id: c.id }, data: { userId: into.id } });
    // Photo: keep the kept person's; otherwise take the duplicate's.
    const photo = await tx.avatarImage.findUnique({ where: { developerId: into.id } });
    const theirs = await tx.avatarImage.findUnique({ where: { developerId: from.id } });
    const takePhoto = !photo && !!theirs;
    if (takePhoto) await tx.avatarImage.update({ where: { developerId: from.id }, data: { developerId: into.id } });
    // Unique links must be freed on the duplicate before the kept person takes them, so delete it first.
    await tx.developer.delete({ where: { id: from.id } });
    await tx.developer.update({
      where: { id: into.id },
      data: {
        jiraAccount: into.jiraAccount ?? from.jiraAccount, githubLogin: into.githubLogin ?? from.githubLogin, googleSub: into.googleSub ?? from.googleSub,
        discordId: into.discordId ?? from.discordId, picture: into.picture ?? from.picture, ...(takePhoto ? { avatarVer: { increment: 1 } } : {}),
      },
    });
  });
  return { tickets: await db.ticket.count({ where: { assigneeId: into.id } }) };
}

/**
 * Which of two records of the same person is kept. The HR-owned one always is; two HR people are different people.
 * With neither owned by HR, a Jira-only entry (no password) folds into the real account, and two real accounts are left for an admin.
 */
export function planMerge(account: Person, jiraLinked: Person): { from: Person; into: Person } | null {
  if (account.hrManaged && jiraLinked.hrManaged) return null;
  if (jiraLinked.hrManaged) return { from: account, into: jiraLinked };
  if (account.hrManaged) return { from: jiraLinked, into: account };
  if (!jiraLinked.passwordHash) return { from: jiraLinked, into: account };
  return null;
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

/** Fold every duplicate of the same person (a Jira-linked entry and a plain account) together when it is clear and unambiguous. */
export async function reconcileJiraPeople() {
  let all = await db.developer.findMany();
  let merged = 0;
  for (const acct of all.filter((d) => d.passwordHash && !d.jiraAccount)) {
    if (!all.some((d) => d.id === acct.id)) continue; // already folded into something earlier in this pass
    const linked = all.filter((d) => d.jiraAccount && d.id !== acct.id);
    const plain = all.filter((d) => d.passwordHash && !d.jiraAccount);
    const twin = pickJiraTwin(acct, linked, plain);
    const plan = twin ? planMerge(acct, twin) : null;
    if (!plan) continue;
    await mergePeople(plan.from.id, plan.into.id);
    merged++;
    all = await db.developer.findMany();
  }
  return { merged };
}

/** Called when someone signs in: if they are not linked to Jira yet, try to find their Jira entry. Never throws. */
export async function linkToJiraOnSignIn(userId: string) {
  try {
    const all = await db.developer.findMany();
    const me = all.find((d) => d.id === userId);
    if (!me || me.jiraAccount || !me.passwordHash) return;
    const twin = pickJiraTwin(me, all.filter((d) => d.jiraAccount && d.id !== me.id), all.filter((d) => d.passwordHash && !d.jiraAccount));
    const plan = twin ? planMerge(me, twin) : null;
    if (plan) await mergePeople(plan.from.id, plan.into.id);
  } catch { /* matching is a convenience; signing in must never fail because of it */ }
}
