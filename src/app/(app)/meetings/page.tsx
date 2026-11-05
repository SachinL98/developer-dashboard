import { db } from "@/lib/db";
import { PageHeader, Kpi } from "@/components/ui";
import { getMeetingDefs } from "@/lib/config";
import { NotesTaker, type MeetingView } from "@/components/NotesTaker";
import { SyncButtons } from "@/components/SyncButtons";
import { fmtDay, fmtTime } from "@/lib/time";
import { googleReady } from "@/lib/integrations/google";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { RecurringButton } from "@/components/RecurringButton";
import { Video } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const hh = (t: [number, number]) => `${String(t[0]).padStart(2, "0")}:${String(t[1]).padStart(2, "0")}`;

export default async function Meetings() {
  const me = await requireUser();
  const canLead = atLeast(me.access, "LEAD");
  const google = await googleReady();
  const defs = (await getMeetingDefs()).filter((d) => d.enabled);
  const now = new Date();
  const [past, upcoming, projects] = await Promise.all([
    db.meeting.findMany({ where: { endsAt: { lt: now } }, orderBy: { startsAt: "desc" }, take: 8, include: { actionItems: { include: { ticket: true } } } }),
    db.meeting.findMany({ where: { endsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 8, include: { actionItems: { include: { ticket: true } } } }),
    db.project.findMany({ take: 1 }),
  ]);
  const openActions = await db.actionItem.count({ where: { done: false } });
  const view = (m: (typeof past)[0]): MeetingView => ({ id: m.id, title: m.title, kind: m.kind, startsAt: m.startsAt.toISOString(), transcript: m.transcript, summary: m.summary, decisions: m.decisions, actions: m.actionItems.map((a) => ({ id: a.id, text: a.text, owner: a.owner, done: a.done, ticketKey: a.ticket?.key ?? null })) });

  return (
    <div className="space-y-6">
      <PageHeader title="Meetings" sub="Google Meet cadence, automated notes, decisions and action items."
        actions={canLead ? <><SyncButtons what="meetings" /><RecurringButton disabled={!google} /></> : undefined} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Next up" value={upcoming[0] ? fmtTime(upcoming[0].startsAt) : "—"} sub={upcoming[0]?.title} accent="#6ee7ff" />
        <Kpi label="With notes" value={`${past.filter((p) => p.summary).length}/${past.length}`} sub="last 8 meetings" accent="#a78bfa" />
        <Kpi label="Open action items" value={openActions} accent="#fbbf24" />
        <Kpi label="Google Meet" value={google ? "Connected" : "Not linked"} sub={google ? "Events, links and transcripts" : "Connect Google in Integrations"} accent="#a3e635" />
      </div>

      <div className="card-pad overflow-x-auto">
        <div className="h-section mb-3">Weekly cadence</div>
        <div className="grid min-w-[760px] grid-cols-5 gap-3">
          {DAYS.map((d, i) => (
            <div key={d}><div className="mb-2 text-sm font-medium">{d}</div>
              <div className="space-y-2">{defs.filter((m) => m.days.includes(i + 1)).sort((a, b) => a.start[0] * 60 + a.start[1] - (b.start[0] * 60 + b.start[1])).map((m) => (
                <div key={m.kind} className="rounded-lg border-l-4 bg-panel2 p-2" style={{ borderColor: m.color }}>
                  <div className="text-xs font-medium">{m.title}</div><div className="font-mono text-[11px] text-mute">{hh(m.start)}–{hh(m.end)}</div></div>))}</div></div>))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-3">
          <div className="h-section">Upcoming</div>
          {upcoming.map((m) => (
            <div key={m.id} id={m.id} className="card-pad">
              <div className="flex items-center justify-between gap-3">
                <div><div className="font-medium">{m.title}</div><div className="text-xs text-mute">{fmtDay(m.startsAt)} · {fmtTime(m.startsAt)}–{fmtTime(m.endsAt)} · {defs.find((d) => d.kind === m.kind)?.blurb}</div></div>
                {m.meetUrl && <a href={m.meetUrl} target="_blank" className="btn-primary"><Video size={14} /> Join</a>}
              </div>
            </div>))}
        </div>
        <div className="space-y-3">
          <div className="h-section">Recent · notes</div>
          {past.map((m) => (
            <details key={m.id} id={m.id} className="card-pad group" open={!!m.summary && past[0]?.id === m.id}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <div><div className="font-medium">{m.title}</div><div className="text-xs text-mute">{fmtDay(m.startsAt)} · {fmtTime(m.startsAt)}</div></div>
                <span className={`chip ${m.summary ? "border-neon-lime/40 text-neon-lime" : ""}`}>{m.summary ? "notes ready" : "no notes"}</span>
              </summary>
              <div className="mt-4"><NotesTaker m={view(m)} projectId={projects[0]?.id ?? ""} canEdit hasMeet={!!m.meetUrl} /></div>
            </details>))}
        </div>
      </div>
    </div>
  );
}
