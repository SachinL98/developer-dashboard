"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Video, Save } from "lucide-react";
import { saveMeetingsAction, setMeetingLinkAction } from "@/app/(app)/actions";
import type { MeetingSetting } from "@/lib/config";

const DAYS: [number, string][] = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];
interface Upcoming { id: string; title: string; when: string; meetUrl: string }

export function MeetingSettings({ initial, upcoming, google }: { initial: MeetingSetting[]; upcoming: Upcoming[]; google: boolean }) {
  const [list, setList] = useState(initial);
  const [links, setLinks] = useState(Object.fromEntries(upcoming.map((u) => [u.id, u.meetUrl])));
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const patch = (kind: string, p: Partial<MeetingSetting>) => setList((l) => l.map((m) => (m.kind === kind ? { ...m, ...p } : m)));
  const toggleDay = (m: MeetingSetting, d: number) => patch(m.kind, { days: m.days.includes(d) ? m.days.filter((x) => x !== d) : [...m.days, d] });

  return (
    <div className="space-y-6">
      {msg && <div role="status" className={clsx("rounded-lg border px-4 py-2 text-sm", msg.bad ? "border-neon-red/40 text-neon-red" : "border-neon-lime/30 text-neon-lime")}>{msg.t}</div>}

      <div className="card-pad space-y-4">
        <div className="h-section">Recurring meetings</div>
        <p className="text-xs text-mute">
          A fixed Meet link is used for every occurrence of that meeting. Leave it empty to {google ? "have Google create a new Meet link per occurrence" : "add links later (Google isn't connected, so none are created automatically)"}.
          Times are in the team timezone (Workspace tab).
        </p>
        <div className="space-y-3">
          {list.map((m) => (
            <div key={m.kind} className={clsx("rounded-xl border border-line bg-panel2 p-4", !m.enabled && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5 accent-[#6ee7ff]" checked={m.enabled} onChange={(e) => patch(m.kind, { enabled: e.target.checked })} /> Enabled</label>
                <input className="input min-w-[180px] flex-1 sm:max-w-xs" aria-label="Title" value={m.title} onChange={(e) => patch(m.kind, { title: e.target.value })} />
                <input type="time" className="input w-[120px]" aria-label="Start" value={m.start} onChange={(e) => patch(m.kind, { start: e.target.value })} />
                <span className="text-mute">to</span>
                <input type="time" className="input w-[120px]" aria-label="End" value={m.end} onChange={(e) => patch(m.kind, { end: e.target.value })} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {DAYS.map(([d, label]) => (
                  <button key={d} type="button" aria-pressed={m.days.includes(d)} onClick={() => toggleDay(m, d)}
                    className={clsx("h-9 min-w-[44px] rounded-lg border px-2 text-xs", m.days.includes(d) ? "border-neon/60 bg-neon/10 text-white" : "border-line text-mute hover:text-ink")}>{label}</button>))}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Video size={16} className="shrink-0 text-mute" />
                <input className="input" aria-label="Google Meet link" placeholder="https://meet.google.com/abc-defg-hij (optional)" value={m.meetUrl} onChange={(e) => patch(m.kind, { meetUrl: e.target.value })} />
              </div>
            </div>))}
        </div>
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
          const r = await saveMeetingsAction(list);
          setMsg(r.ok ? { t: `Saved. ${r.created} upcoming meeting(s) created, ${r.removed} outdated one(s) removed.` } : { t: r.error, bad: true });
          router.refresh();
        })}><Save size={14} /> Save schedule and links</button>
      </div>

      <div className="card-pad space-y-3">
        <div className="h-section">Upcoming meetings · override one link</div>
        {upcoming.length === 0 && <p className="text-sm text-mute">No upcoming meetings yet. Save the schedule above to generate the next two weeks.</p>}
        <ul className="space-y-2">
          {upcoming.map((u) => (
            <li key={u.id} className="flex flex-col gap-2 rounded-lg border border-line bg-panel2 p-3 sm:flex-row sm:items-center">
              <div className="sm:w-64"><div className="text-sm font-medium">{u.title}</div><div className="text-xs text-mute">{u.when}</div></div>
              <input className="input" aria-label={`Meet link for ${u.title}`} placeholder="No link yet" value={links[u.id] ?? ""} onChange={(e) => setLinks((l) => ({ ...l, [u.id]: e.target.value }))} />
              <button className="btn" disabled={pending || (links[u.id] ?? "") === u.meetUrl} onClick={() => start(async () => {
                const r = await setMeetingLinkAction(u.id, links[u.id] ?? "");
                setMsg(r.ok ? { t: `${u.title}: link saved.` } : { t: r.error, bad: true });
                router.refresh();
              })}>Save</button>
            </li>))}
        </ul>
      </div>
    </div>
  );
}
