"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus } from "lucide-react";
import { saveHolidaysAction } from "@/app/(app)/actions";

export function HolidayEditor({ initial }: { initial: { date: string; name: string }[] }) {
  const router = useRouter();
  const [list, setList] = useState(initial);
  const [d, setD] = useState(""), [n, setN] = useState("");
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const add = () => { if (!d || !n.trim()) return; setList([...list.filter((h) => h.date !== d), { date: d, name: n.trim() }].sort((a, b) => a.date.localeCompare(b.date))); setD(""); setN(""); setMsg(null); };
  const save = () => start(async () => { const r = await saveHolidaysAction(list); setMsg(r.ok ? { t: "Saved. Capacity and forecasts now skip these days." } : { t: r.error, bad: true }); router.refresh(); });
  return (
    <div className="card-pad max-w-2xl space-y-4">
      <div className="h-section">Public holidays</div>
      <p className="text-xs text-mute">A holiday on a weekday removes that day from everyone&apos;s capacity in the sprint planner, auto-fill, forecasts and reports. Weekends are always off.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div><label className="label" htmlFor="h-date">Date</label><input id="h-date" type="date" className="input" value={d} onChange={(e) => setD(e.target.value)} /></div>
        <div className="min-w-[10rem] flex-1"><label className="label" htmlFor="h-name">Name</label><input id="h-name" className="input" maxLength={80} value={n} onChange={(e) => setN(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="e.g. Poya Day" /></div>
        <button className="btn" onClick={add} disabled={!d || !n.trim()}><Plus size={14} /> Add</button>
      </div>
      <ul className="divide-y divide-line/60">
        {list.map((h) => <li key={h.date} className="flex items-center justify-between gap-3 py-2 text-sm"><span><span className="font-mono text-xs text-mute">{h.date}</span> &nbsp;{h.name}</span>
          <button className="rounded p-1.5 text-mute hover:text-neon-red" aria-label={`Remove ${h.name}`} onClick={() => setList(list.filter((x) => x.date !== h.date))}><Trash2 size={14} /></button></li>)}
        {!list.length && <li className="py-4 text-sm text-mute">No holidays added yet.</li>}
      </ul>
      <div className="flex items-center gap-3"><button className="btn-primary" disabled={pending} onClick={save}>Save holidays</button>
        {msg && <span role={msg.bad ? "alert" : "status"} className={`text-sm ${msg.bad ? "text-neon-red" : "text-neon-lime"}`}>{msg.t}</span>}</div>
    </div>
  );
}
