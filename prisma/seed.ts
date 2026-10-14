import { PrismaClient, Status, TicketType, Priority } from "@prisma/client";
import { STATUS_ORDER } from "../src/lib/workflow";
import { occurrences, defFor } from "../src/lib/schedule";
import { parseNotes } from "../src/lib/notes";
import { scanDiff, freshChecklist } from "../src/lib/review-template";

const db = new PrismaClient();
let seedN = 42;
const rnd = () => ((seedN = (seedN * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
const DAY = 86_400_000, HR = 3_600_000;

const devs = [
  { name: "Amaya Perera", email: "amaya@spaceitlabs.com", githubLogin: "amaya-p", role: "Tech Lead", access: "LEAD" as const, avatarHue: 190, capacityHrs: 28 },
  { name: "Nuwan Silva", email: "nuwan@spaceitlabs.com", githubLogin: "nuwan-s", role: "Senior Developer", avatarHue: 265, capacityHrs: 32 },
  { name: "Dilini Fernando", email: "dilini@spaceitlabs.com", githubLogin: "dilini-f", role: "Developer", avatarHue: 330, capacityHrs: 32 },
  { name: "Kasun Jayawardena", email: "kasun@spaceitlabs.com", githubLogin: "kasun-j", role: "Developer", avatarHue: 85, capacityHrs: 30 },
  { name: "Ishara Gunasekara", email: "ishara@spaceitlabs.com", githubLogin: "ishara-g", role: "QA Engineer", avatarHue: 35, capacityHrs: 30 },
  { name: "Sachin Lakshan", email: "sachin.lakshan@spaceitlabs.com", githubLogin: "SachinL98", role: "Engineering Manager", access: "ADMIN" as const, avatarHue: 150, capacityHrs: 20 },
];

const projects = [
  { key: "ATL", name: "Atlas Portal", repo: "spaceit-labs/atlas-portal", color: "#6ee7ff" },
  { key: "NOV", name: "Nova Mobile API", repo: "spaceit-labs/nova-api", color: "#a78bfa" },
  { key: "ORB", name: "Orbit Billing", repo: "spaceit-labs/orbit-billing", color: "#f472b6" },
];

const titles: Record<string, [string, TicketType][]> = {
  ATL: [
    ["Customer search returns stale results after rename", "BUG"], ["Add CSV export to usage report", "FEATURE"], ["Dark mode for account settings", "ENHANCEMENT"],
    ["SSO login redirect loop on Safari", "BUG"], ["Role-based access for project admins", "FEATURE"], ["Paginate audit log endpoint", "ENHANCEMENT"],
    ["Email digest for weekly activity", "FEATURE"], ["Fix timezone shift in booking calendar", "BUG"], ["Bulk invite users via CSV", "FEATURE"],
    ["Migrate legacy tenant table to new schema", "TASK"], ["Improve dashboard load time", "ENHANCEMENT"], ["Session expiry warning modal", "FEATURE"],
    ["Saved filters on tickets table", "FEATURE"], ["Webhook signature verification", "ENHANCEMENT"], ["Broken avatar upload on Firefox", "BUG"], ["Tenant data export (GDPR)", "FEATURE"], ["Upgrade Node runtime to LTS", "TASK"], ["Keyboard shortcuts for navigation", "ENHANCEMENT"],
  ],
  NOV: [
    ["Push notification token refresh crash", "BUG"], ["Offline cache for order history", "FEATURE"], ["Rate-limit public search endpoint", "ENHANCEMENT"],
    ["GraphQL N+1 on product variants", "BUG"], ["Add biometric re-auth endpoint", "FEATURE"], ["Version the mobile config API", "TASK"],
    ["Webhook retry with backoff", "ENHANCEMENT"], ["Deep link handling for invite codes", "FEATURE"], ["Fix image upload 413 on large files", "BUG"],
    ["Background sync conflict resolution", "FEATURE"], ["Crash on Android 14 camera permission", "BUG"], ["Reduce API payload for product list", "ENHANCEMENT"], ["Add feature flags endpoint", "TASK"], ["Analytics events for checkout funnel", "FEATURE"],
  ],
  ORB: [
    ["Proration wrong on mid-cycle plan upgrade", "BUG"], ["Invoice PDF branding options", "FEATURE"], ["Stripe webhook idempotency keys", "ENHANCEMENT"],
    ["Seed tax rates for new regions", "TASK"], ["Dunning emails for failed payments", "FEATURE"], ["Reconciliation report mismatch >1 cent", "BUG"],
    ["Usage-based billing tiers", "FEATURE"], ["Credit note API", "FEATURE"], ["Cache currency rates", "ENHANCEMENT"],
    ["Refund partial amounts", "FEATURE"], ["Backfill missing invoice numbers", "TASK"], ["Fix rounding on multi-currency totals", "BUG"], ["Self-serve payment method update", "FEATURE"], ["Audit trail for plan changes", "ENHANCEMENT"],
  ],
};

const rank = (s: Status) => STATUS_ORDER.indexOf(s);

async function main() {
  await db.$transaction([
    db.actionItem.deleteMany(), db.meeting.deleteMany(), db.prReview.deleteMany(), db.estimateVote.deleteMany(), db.progressLog.deleteMany(),
    db.timeEntry.deleteMany(), db.workSession.deleteMany(), db.connection.deleteMany(), db.authSession.deleteMany(), db.transition.deleteMany(), db.ticket.deleteMany(), db.sprint.deleteMany(),
    db.project.deleteMany(), db.developer.deleteMany(),
  ]);
  const D = await Promise.all(devs.map((d) => db.developer.create({ data: d })));
  const coders = D.slice(0, 5);
  const P = await Promise.all(projects.map((p) => db.project.create({ data: p })));

  const now = new Date();
  const monday = new Date(now); monday.setUTCHours(3, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); // this week's Monday 08:30 +05:30
  const weeks = 2;
  const sprintDefs = [
    { name: "Sprint 21", state: "CLOSED", start: new Date(monday.getTime() - 6 * 7 * DAY), goal: "Search & SSO stability" },
    { name: "Sprint 22", state: "CLOSED", start: new Date(monday.getTime() - 4 * 7 * DAY), goal: "Billing proration fixes" },
    { name: "Sprint 23", state: "CLOSED", start: new Date(monday.getTime() - 2 * 7 * DAY), goal: "Mobile offline foundations" },
    { name: "Sprint 24", state: "ACTIVE", start: monday, goal: "Admin roles, exports and webhook reliability" },
    { name: "Sprint 25", state: "PLANNING", start: new Date(monday.getTime() + 2 * 7 * DAY), goal: "TBD in sprint plan" },
  ] as const;
  // The active sprint should include "today": slide it back so it began ~4 working days ago
  const sprints: Awaited<ReturnType<typeof db.sprint.create>>[] = [];
  for (const s of sprintDefs) {
    const start = s.state === "ACTIVE" ? new Date(now.getTime() - 4 * DAY) : s.state === "PLANNING" ? new Date(now.getTime() + 10 * DAY)
      : new Date(now.getTime() - (s.name === "Sprint 23" ? 18 : s.name === "Sprint 22" ? 32 : 46) * DAY);
    sprints.push(await db.sprint.create({ data: { name: s.name, goal: s.goal, state: s.state, startDate: start, endDate: new Date(start.getTime() + weeks * 7 * DAY - DAY) } }));
  }

  let keyN: Record<string, number> = { ATL: 100, NOV: 200, ORB: 300 };
  const flat = P.flatMap((p) => titles[p.key].map(([t, ty]) => ({ p, t, ty: ty as TicketType })));
  let rankN = 1;

  async function mk(spec: { p: (typeof P)[0]; t: string; ty: TicketType }, status: Status, sprint: (typeof sprints)[0] | null, opts: { startOffset?: number; closeOffset?: number } = {}) {
    const points = pick([1, 2, 3, 3, 5, 5, 8]);
    const est = Math.round(points * (2 + rnd() * 2) * 2) / 2;
    const dev = pick(coders);
    const started = sprint ? new Date(sprint.startDate.getTime() + (opts.startOffset ?? rnd() * 3) * DAY) : null;
    const reachedProd = rank(status) >= rank("DEPLOYED_PROD");
    const created = new Date((sprint?.startDate ?? now).getTime() - (3 + rnd() * 10) * DAY);
    const inFlight = rank(status) >= rank("IN_PROGRESS");
    const t = await db.ticket.create({
      data: {
        key: `${spec.p.key}-${++keyN[spec.p.key]}`, title: spec.t, type: spec.ty, priority: pick<Priority>(["CRITICAL", "HIGH", "HIGH", "MEDIUM", "MEDIUM", "LOW"]),
        description: `As a user I need this resolved.\n\nAcceptance criteria:\n- Behaviour verified on staging\n- Docs updated where relevant`,
        status, rank: rankN++, storyPoints: rank(status) >= rank("READY_TO_DEV") || sprint ? points : rnd() > 0.5 ? points : null,
        estimateHrs: sprint || rank(status) >= rank("READY_TO_DEV") ? est : null, projectId: spec.p.id, sprintId: sprint?.id,
        assigneeId: inFlight || rank(status) >= rank("READY_TO_DEV") ? dev.id : null, createdAt: created, labels: pick([[], ["backend"], ["frontend"], ["db"], ["api", "backend"]]),
        complicated: rnd() > 0.85,
        progressPct: status === "IN_PROGRESS" ? Math.floor(15 + rnd() * 70) : rank(status) >= rank("INITIAL_REVIEW") ? 100 : 0,
        startedAt: inFlight ? started : null,
        prUrl: rank(status) >= rank("INITIAL_REVIEW") || (status === "IN_PROGRESS" && rnd() > 0.5) ? `https://github.com/${spec.p.repo}/pull/${40 + Math.floor(rnd() * 60)}` : null,
        prState: rank(status) >= rank("DEPLOYED_STG") ? "merged" : rank(status) >= rank("INITIAL_REVIEW") ? "open" : null,
        doneAt: reachedProd ? new Date((started ?? now).getTime() + (opts.closeOffset ?? 4 + rnd() * 6) * DAY) : null,
      },
    });
    // transitions along the path
    const path: Status[] = STATUS_ORDER.filter((s) => rank(s) <= rank(status) && s !== "FAILED_STG");
    let at = started ?? created;
    let prev: Status | null = null;
    const span = ((t.doneAt ?? now).getTime() - at.getTime()) / Math.max(1, path.length);
    for (const s of path) {
      if (prev) await db.transition.create({ data: { ticketId: t.id, from: prev, to: s, at: new Date(at.getTime() + span * path.indexOf(s) * (0.7 + rnd() * 0.6)), byId: t.assigneeId } });
      prev = s;
    }
    // staging failure on a few
    if (rank(status) >= rank("DOCUMENTED") && rnd() > 0.7) {
      const base = new Date(at.getTime() + span * 4);
      await db.transition.createMany({ data: [
        { ticketId: t.id, from: "DEPLOYED_STG", to: "FAILED_STG", at: new Date(base.getTime() + HR * 3) },
        { ticketId: t.id, from: "FAILED_STG", to: "IN_PROGRESS", at: new Date(base.getTime() + HR * 5) },
      ] });
    }
    // time entries: actual hours ≈ estimate × accuracy factor
    if (inFlight && dev) {
      const factor = status === "IN_PROGRESS" ? 0.3 + (t.progressPct / 100) * 0.7 : 0.7 + rnd() * 0.9;
      let remaining = est * factor;
      let d = 0;
      while (remaining > 0.05) {
        const h = Math.min(remaining, 1.5 + rnd() * 3);
        const s0 = new Date((started ?? now).getTime() + d * DAY + 2 * HR + rnd() * 4 * HR);
        if (s0 > now) break;
        await db.timeEntry.create({ data: { ticketId: t.id, developerId: t.assigneeId!, startedAt: s0, endedAt: new Date(s0.getTime() + h * HR) } });
        remaining -= h; d += rnd() > 0.5 ? 1 : 0;
      }
      if (status === "IN_PROGRESS") {
        await db.progressLog.createMany({ data: [
          { ticketId: t.id, pct: Math.max(5, t.progressPct - 30), note: "Scaffolding done", at: new Date(now.getTime() - 2 * DAY) },
          { ticketId: t.id, pct: t.progressPct, note: "Core logic in, writing tests", at: new Date(now.getTime() - 4 * HR) },
        ] });
      }
    }
    if (rank(status) >= rank("INITIAL_REVIEW")) {
      const items = freshChecklist().map((i) => ({ ...i, checked: true, auto: true }));
      await db.prReview.create({ data: { ticketId: t.id, kind: "INITIAL_CLAUDE", round: 1, items: items as any, passed: true } });
    }
    return t;
  }

  // Closed sprints: everything shipped (a few carry over as Documented)
  const pool = [...flat];
  for (const s of sprints.slice(0, 3)) {
    const n = 7 + Math.floor(rnd() * 3);
    for (let i = 0; i < n && pool.length > 18; i++) await mk(pool.splice(Math.floor(rnd() * pool.length), 1)[0], "DONE", s, { startOffset: rnd() * 5, closeOffset: 5 + rnd() * 8 });
  }
  // Active sprint spread across the board
  const activeStatuses: Status[] = ["READY_TO_DEV", "READY_TO_DEV", "IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS", "IN_PROGRESS", "INITIAL_REVIEW", "REVIEW", "REVIEW", "DEPLOYED_STG", "FAILED_STG", "DOCUMENTED", "DEPLOYED_PROD", "DONE", "DONE"];
  const active = sprints[3];
  for (const st of activeStatuses) {
    const t = await mk(pool.splice(Math.floor(rnd() * pool.length), 1)[0], st, active, { startOffset: rnd() * 1.5, closeOffset: 1.5 + rnd() * 2 });
    if (st === "FAILED_STG") await db.transition.create({ data: { ticketId: t.id, from: "DEPLOYED_STG", to: "FAILED_STG", at: new Date(now.getTime() - 3 * HR) } });
  }
  // Planning sprint + backlog
  for (let i = 0; i < 4 && pool.length; i++) await mk(pool.splice(0, 1)[0], "BACKLOG", sprints[4]);
  while (pool.length) await mk(pool.splice(0, 1)[0], "BACKLOG", null);
  // Backlog tickets shouldn't pretend to be assigned
  await db.ticket.updateMany({ where: { status: "BACKLOG" }, data: { assigneeId: null, progressPct: 0, startedAt: null, doneAt: null, prUrl: null, prState: null } });
  await db.ticket.updateMany({ where: { status: "BACKLOG", sprintId: sprints[4].id }, data: { estimateHrs: null } });

  // Work sessions: 12 working days of clock in/out per dev
  for (const d of coders) {
    for (let back = 14; back >= 0; back--) {
      const day = new Date(now.getTime() - back * DAY);
      if ([0, 6].includes(day.getUTCDay())) continue;
      const startMs = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 3, 0) + Math.floor(rnd() * 50) * 60_000; // ~08:30–09:20 local
      const start = new Date(startMs);
      if (start > now) continue;
      const len = (7.2 + rnd() * 2.2) * HR;
      const end = new Date(Math.min(start.getTime() + len, back === 0 ? now.getTime() - 1 : Infinity));
      await db.workSession.create({ data: { developerId: d.id, startedAt: start, endedAt: back === 0 && rnd() > 0.3 ? null : end } });
    }
  }
  // Time entries inside sessions aren't enforced; fine for demo.

  // Meetings: past 10 days + next 7 days from the real cadence
  const occ = occurrences(new Date(now.getTime() - 10 * DAY), 17);
  const names = D.map((d) => d.name);
  const open = await db.ticket.findMany({ where: { sprintId: active.id }, take: 6 });
  for (const o of occ) {
    const past = o.endsAt < now;
    const k = open[Math.floor(rnd() * open.length)]?.key ?? "ATL-101";
    let transcript: string | null = null;
    if (past && o.kind === "STANDUP" && rnd() > 0.4) {
      transcript = [
        `${D[0].name.split(" ")[0]}: Yesterday finished the role guard on ${k}. Today starting the audit log pagination. No blockers.`,
        `${D[1].name.split(" ")[0]}: Yesterday worked on webhook retries. Today code review for ${open[1]?.key ?? k}. Blocked on staging credentials for the queue.`,
        `${D[2].name.split(" ")[0]}: Yesterday fixed the timezone bug. Today writing the migration for tenants. I'll ping Ishara for staging test data.`,
      ].join("\n");
    } else if (past && o.kind === "SPRINT_PLAN") {
      transcript = `Sachin: Capacity looks tight this sprint, we agreed to hold the usage billing tiers for Sprint 25.\nAmaya: Decided to prioritise the SSO redirect bug first. I'll split ${k} into two tickets.\nNuwan: We need to add seed data for the new tax regions before staging.`;
    }
    const parsed = transcript ? parseNotes(transcript, names) : null;
    const m = await db.meeting.create({
      data: {
        kind: o.kind, title: o.title, startsAt: o.startsAt, endsAt: o.endsAt, meetUrl: `https://meet.google.com/${o.kind.toLowerCase().slice(0, 3)}-${["abcd", "wxyz", "qrst"][o.startsAt.getUTCDay() % 3]}-${o.kind.length}vp`,
        attendees: D.map((d) => d.email), transcript, summary: parsed?.summary, decisions: parsed?.decisions ?? [],
      },
    });
    if (parsed) for (const a of parsed.actionItems) await db.actionItem.create({ data: { meetingId: m.id, text: a.text, owner: a.owner, done: rnd() > 0.6 } });
    void defFor;
  }
  void scanDiff;

  const counts = await Promise.all([db.ticket.count(), db.timeEntry.count(), db.meeting.count()]);
  console.log(`Seeded ${D.length} developers, ${P.length} projects, ${sprints.length} sprints, ${counts[0]} tickets, ${counts[1]} time entries, ${counts[2]} meetings`);
}

main().finally(() => db.$disconnect());
