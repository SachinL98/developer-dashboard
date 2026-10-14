"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestLeaveAction } from "@/app/(app)/actions";
import { LEAVE_TYPES } from "@/lib/capacity";

export function LeaveForm({ today, people }: { today: string; people?: { id: string; name: string }[] }) {
  const router = useRouter();
  const [v, setV] = useState({ type: "ANNUAL", start: today, end: today, half: false, reason: "", who: "" });
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const single = v.start === v.end;
  const submit = () => start(async () => {
    const r = await requestLeaveAction({ type: v.type as any, start: v.start, end: v.end, portion: v.half && single ? "HALF" : "FULL", reason: v.reason, developerId: v.who || undefined });
    if (r.ok) { setMsg({ t: v.who ? "Leave registered and approved." : "Request sent. A lead or admin will approve it." }); setV({ ...v, reason: "", half: false }); router.refresh(); } else setMsg({ t: r.error, bad: true });
  });
  return (
    <form className="card-pad space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="h-section">Register leave</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {people && <div className="sm:col-span-2 lg:col-span-4"><label className="label" htmlFor="lv-who">For</label>
          <select id="lv-who" className="input" value={v.who} onChange={(e) => setV({ ...v, who: e.target.value })}><option value="">Me (needs approval)</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name} (approved straight away)</option>)}</select></div>}
        <div><label className="label" htmlFor="lv-type">Type</label><select id="lv-type" className="input" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{LEAVE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
        <div><label className="label" htmlFor="lv-start">From</label><input id="lv-start" type="date" required className="input" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value, end: v.end < e.target.value ? e.target.value : v.end })} /></div>
        <div><label className="label" htmlFor="lv-end">To</label><input id="lv-end" type="date" required min={v.start} className="input" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} /></div>
        <div className="flex items-end"><label className={`flex items-center gap-2 text-sm ${single ? "" : "opacity-50"}`}><input type="checkbox" disabled={!single} checked={v.half && single} onChange={(e) => setV({ ...v, half: e.target.checked })} /> Half day</label></div>
      </div>
      <div><label className="label" htmlFor="lv-reason">Note (optional)</label><input id="lv-reason" className="input" maxLength={300} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="Anything the team should know" /></div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending}>{v.who ? "Register leave" : "Request leave"}</button>
        {msg && <span role={msg.bad ? "alert" : "status"} className={`text-sm ${msg.bad ? "text-neon-red" : "text-neon-lime"}`}>{msg.t}</span>}
      </div>
      <p className="text-xs text-mute">Weekends and public holidays are not counted. Approved leave lowers your capacity in the sprint planner and pushes forecast finish dates out.</p>
    </form>
  );
}
