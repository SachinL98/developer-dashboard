import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { PageHeader, StatusBadge, Empty } from "@/components/ui";
import { fmtDay, fmtTime, TZ } from "@/lib/time";
import { stuckTickets } from "@/lib/delivery-rules";
import { approvedLeave } from "@/lib/leave";
import { localDate } from "@/lib/time";
import { Ban, CalendarClock, Camera, Clock, Flame } from "lucide-react";

export const dynamic = "force-dynamic";

const OPEN = ["READY_TO_DEV", "IN_PROGRESS", "INITIAL_REVIEW", "REVIEW", "FAILED_STG"] as const;

export default async function MyDay() {
  const me = await requireUser();
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", hour: "numeric" }).format(now));
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = localDate(now);
  const [session, timer, mine, meetings, inbox, leaves, waitingReview] = await Promise.all([
    db.workSession.findFirst({ where: { developerId: me.id, endedAt: null } }),
    db.timeEntry.findFirst({ where: { developerId: me.id, endedAt: null }, include: { ticket: true } }),
    db.ticket.findMany({ where: { assigneeId: me.id, status: { in: OPEN as never } }, orderBy: [{ priority: "desc" }, { rank: "asc" }] }),
    db.meeting.findMany({ where: { startsAt: { gte: new Date(now.getTime() - 3600_000), lte: new Date(now.getTime() + 30 * 3600_000) } }, orderBy: { startsAt: "asc" }, take: 5 }),
    db.notification.findMany({ where: { userId: me.id, readAt: null }, orderBy: { createdAt: "desc" }, take: 5 }),
    approvedLeave(today, today),
    atLeast(me.access, "LEAD") ? db.ticket.findMany({ where: { status: { in: ["INITIAL_REVIEW", "REVIEW"] }, NOT: { assigneeId: me.id } }, select: { id: true, key: true, title: true }, take: 6 }) : Promise.resolve([]),
  ]);
  const onLeave = leaves.some((l) => l.developerId === me.id);
  const overdue = mine.filter((t) => t.dueDate && t.dueDate < now);
  const blocked = mine.filter((t) => t.blocked);
  const stuck = stuckTickets(mine.map((t) => ({ id: t.id, key: t.key, title: t.title, status: t.status, assigneeId: t.assigneeId, since: t.updatedAt })), now);
  const failed = mine.filter((t) => t.status === "FAILED_STG");
  const attention = overdue.length + blocked.length + stuck.length + failed.length;

  return (
    <div className="space-y-6">
      <PageHeader title={`${hello}, ${me.name.split(" ")[0]}`} sub={onLeave ? "You are on leave today. Enjoy the time off." : session ? `Your work day started at ${fmtTime(session.startedAt)}.` : "Start your day when you are ready: pick today's cards and leave a note for the team."} />

      {me.avatarVer === 0 && (
        <Link href="/settings" className="card flex items-center gap-3 px-4 py-3 text-sm hover:border-neon/40"><Camera size={16} className="text-neon" /><span>Add a profile photo so your team recognises you.</span><span className="ml-auto font-medium text-neon">Add photo →</span></Link>)}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {timer && (
            <Link href={`/tickets/${timer.ticket.id}`} className="card-pad flex items-center gap-4 border-neon/40 hover:border-neon">
              <span className="live-dot h-2.5 w-2.5 rounded-full bg-neon-lime" />
              <div className="min-w-0"><div className="text-xs text-mute">Timer running</div><div className="truncate font-medium"><span className="font-mono text-sm text-mute">{timer.ticket.key}</span> {timer.ticket.title}</div></div>
              <Clock size={18} className="ml-auto text-mute" />
            </Link>)}

          <section className="card-pad">
            <h2 className="mb-3 text-sm font-semibold">Your cards</h2>
            {mine.length ? (
              <ul className="divide-y divide-line/70">
                {mine.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tickets/${t.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:bg-panel2/50">
                      <span className="font-mono text-xs text-mute">{t.key}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                      {t.blocked && <span className="pill bg-neon-red/10 text-neon-red"><Ban size={11} /> Blocked</span>}
                      {t.dueDate && <span className={`text-xs ${t.dueDate < now ? "text-neon-red" : "text-mute"}`}>due {fmtDay(t.dueDate)}</span>}
                      {t.complicated && <Flame size={13} className="text-neon-amber" aria-label="Needs grooming" />}
                      <StatusBadge status={t.status} />
                    </Link>
                  </li>))}
              </ul>) : <Empty>No cards assigned to you right now. Ask a lead, or pick something from the <Link href="/board" className="text-neon underline">board</Link>.</Empty>}
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="card-pad">
            <h2 className="rail-title">Needs your attention {attention > 0 && <span className="pill bg-neon-amber/10 text-neon-amber">{attention}</span>}</h2>
            <ul className="space-y-2 text-sm">
              {failed.map((t) => <li key={t.id}><Link href={`/tickets/${t.id}`} className="hover:underline"><span className="font-mono text-xs text-mute">{t.key}</span> failed in staging</Link></li>)}
              {overdue.map((t) => <li key={t.id}><Link href={`/tickets/${t.id}`} className="hover:underline"><span className="font-mono text-xs text-mute">{t.key}</span> is past its due date</Link></li>)}
              {blocked.map((t) => <li key={t.id}><Link href={`/tickets/${t.id}`} className="hover:underline"><span className="font-mono text-xs text-mute">{t.key}</span> is blocked{t.blockedReason ? `: ${t.blockedReason}` : ""}</Link></li>)}
              {stuck.map((t) => <li key={t.id}><Link href={`/tickets/${t.id}`} className="hover:underline"><span className="font-mono text-xs text-mute">{t.key}</span> has waited {t.days} working days</Link></li>)}
              {!attention && <li className="text-mute">Nothing needs attention. 🎉</li>}
            </ul>
          </section>

          {waitingReview.length > 0 && (
            <section className="card-pad">
              <h2 className="rail-title">Waiting for review</h2>
              <ul className="space-y-2 text-sm">{waitingReview.map((t) => <li key={t.id}><Link href={`/tickets/${t.id}`} className="hover:underline"><span className="font-mono text-xs text-mute">{t.key}</span> {t.title}</Link></li>)}</ul>
            </section>)}

          <section className="card-pad">
            <h2 className="rail-title">Meetings <Link href="/meetings" className="text-xs font-medium text-neon hover:underline">All</Link></h2>
            {meetings.length ? <ul className="space-y-2 text-sm">{meetings.map((m) => <li key={m.id} className="flex items-center gap-2"><CalendarClock size={14} className="text-mute" /><Link href={`/meetings#${m.id}`} className="min-w-0 flex-1 truncate hover:underline">{m.title}</Link><span className="text-xs text-mute">{fmtTime(m.startsAt)}</span></li>)}</ul> : <p className="text-sm text-mute">No meetings in the next day.</p>}
          </section>

          {inbox.length > 0 && (
            <section className="card-pad">
              <h2 className="rail-title">Unread</h2>
              <ul className="space-y-2 text-sm">{inbox.map((n) => <li key={n.id}>{n.href ? <Link href={n.href} className="hover:underline">{n.title}</Link> : n.title}{n.body && <div className="text-xs text-mute">{n.body}</div>}</li>)}</ul>
            </section>)}
        </aside>
      </div>
      
    </div>
  );
}
