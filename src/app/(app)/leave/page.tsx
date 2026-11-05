import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { LeaveForm } from "@/components/LeaveForm";
import { LeaveList, type LeaveRow } from "@/components/LeaveList";
import { addDays, eachDay, LEAVE_TYPES, requestDays, weekday } from "@/lib/capacity";
import { getHolidays } from "@/lib/leave";
import { getWorkspace } from "@/lib/config";
import { localDate } from "@/lib/time";

const typeLabel = (t: string) => LEAVE_TYPES.find((x) => x.id === t)?.label ?? t;
const fmt = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireUser();
  await getWorkspace(); // applies the team timezone
  const sp = await searchParams;
  const today = localDate(new Date());
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const lead = atLeast(me.access, "LEAD");
  const holidays = await getHolidays();

  // Month grid, Monday first.
  const first = `${month}-01`;
  const gridStart = addDays(first, -((weekday(first) + 6) % 7));
  const nextFirst = addDays(first, 31).slice(0, 8) + "01";
  const lastDay = addDays(nextFirst, -1);
  const gridEnd = addDays(lastDay, 6 - ((weekday(lastDay) + 6) % 7));
  const days = eachDay(gridStart, gridEnd);
  const prev = addDays(first, -1).slice(0, 7), next = nextFirst.slice(0, 7);

  const [inGrid, mine, pending, upcoming, people] = await Promise.all([
    db.leave.findMany({ where: { status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: gridEnd }, endDate: { gte: gridStart } }, include: { developer: true } }),
    db.leave.findMany({ where: { developerId: me.id }, orderBy: { startDate: "desc" }, take: 20 }),
    lead ? db.leave.findMany({ where: { status: "PENDING" }, orderBy: { startDate: "asc" }, include: { developer: true } }) : [],
    db.leave.findMany({ where: { status: "APPROVED", endDate: { gte: today } }, orderBy: { startDate: "asc" }, take: 30, include: { developer: true } }),
    lead ? db.developer.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : undefined,
  ]);
  const row = (l: (typeof mine)[number] & { developer?: { name: string } }): LeaveRow => ({
    id: l.id, who: l.developer?.name ?? me.name, mine: l.developerId === me.id, type: typeLabel(l.type), half: l.portion === "HALF", reason: l.reason, status: l.status, note: l.decisionNote,
    range: l.startDate === l.endDate ? fmt(l.startDate) : `${fmt(l.startDate)} to ${fmt(l.endDate)}`, days: requestDays(l.startDate, l.endDate, l.portion as "FULL" | "HALF", holidays),
    canCancel: (l.status === "PENDING" || l.status === "APPROVED") && l.endDate >= today && (l.developerId === me.id || lead),
  });
  const hol = new Map(holidays.map((h) => [h.date, h.name]));
  const monthName = new Date(first + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-6">
      <PageHeader title="Leave" sub="Register leave and see who is away. Approved leave and public holidays lower capacity in the sprint planner, auto-fill, forecasts and reports." />
      <LeaveForm today={today} people={people} />

      {lead && (
        <div className="card-pad">
          <div className="h-section mb-1">Waiting for approval · {pending.length}</div>
          <LeaveList rows={pending.map(row)} canDecide empty="Nothing waiting for approval." />
        </div>)}

      <div className="card-pad">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="h-section">Team calendar · {monthName}</div>
          <div className="flex gap-2">
            <Link className="btn px-2.5 py-1" href={`/leave?month=${prev}`} aria-label="Previous month"><ChevronLeft size={15} /></Link>
            <Link className="btn px-3 py-1" href="/leave">Today</Link>
            <Link className="btn px-2.5 py-1" href={`/leave?month=${next}`} aria-label="Next month"><ChevronRight size={15} /></Link>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[680px] grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line text-xs" role="grid" aria-label={`Team leave in ${monthName}`}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="bg-panel2 px-2 py-1.5 font-semibold uppercase tracking-wider text-mute" role="columnheader">{d}</div>)}
            {days.map((d) => {
              const away = inGrid.filter((l) => l.startDate <= d && l.endDate >= d);
              const off = weekday(d) === 0 || weekday(d) === 6;
              return (
                <div key={d} role="gridcell" className={clsx("min-h-[78px] bg-panel p-1.5", off && "bg-panel2", d.slice(0, 7) !== month && "opacity-45")}>
                  <div className={clsx("mb-1 font-mono", d === today ? "inline-grid h-5 w-5 place-items-center rounded-full bg-neon text-on-accent" : "text-mute")}>{+d.slice(8)}</div>
                  {hol.has(d) && <div className="mb-1 truncate rounded bg-neon-amber/15 px-1 text-[10px] text-neon-amber" title={hol.get(d)}>{hol.get(d)}</div>}
                  {!off && !hol.has(d) && away.map((l) => (
                    <div key={l.id} title={`${l.developer.name}: ${typeLabel(l.type)}${l.portion === "HALF" ? " (half day)" : ""}${l.status === "PENDING" ? " (pending)" : ""}`}
                      className={clsx("mb-0.5 truncate rounded px-1 text-[10px]", l.status === "PENDING" ? "border border-dashed border-neon-amber/50 text-neon-amber" : "bg-neon/15 text-ink")}>
                      {l.developer.name.split(" ")[0]}{l.portion === "HALF" ? " ½" : ""}
                    </div>))}
                </div>);
            })}
          </div>
        </div>
        <p className="mt-2 text-xs text-mute">Solid = approved, dashed = waiting for approval, amber = public holiday.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card-pad"><div className="h-section mb-1">Upcoming team leave</div><LeaveList rows={upcoming.map(row)} canDecide={false} empty="No upcoming approved leave." /></div>
        <div className="card-pad"><div className="h-section mb-1">My requests</div><LeaveList rows={mine.map(row)} canDecide={false} showWho={false} empty="You haven't registered any leave yet." /></div>
      </div>
    </div>
  );
}
