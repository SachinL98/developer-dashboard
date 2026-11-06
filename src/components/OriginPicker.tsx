"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { confirmBugOriginAction } from "@/app/(app)/actions";

/** "Which ticket caused this bug?" One click on a suggestion, or type a ticket key. A confirmed answer replaces the automatic guess. */
export function OriginPicker({ bugKey, suggestions, confirmed }: { bugKey: string; suggestions: { key: string; title: string }[]; confirmed: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [other, setOther] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const save = (origin: string) => start(async () => { setErr(null); const r = await confirmBugOriginAction(bugKey, origin); if (!r.ok) setErr(r.error); else router.refresh(); });
  return (
    <div className="space-y-1.5 text-xs">
      {confirmed && <div className="flex items-center gap-2"><span className="pill bg-neon-lime/10 text-neon-lime"><Check size={11} /> Confirmed: {confirmed}</span><button className="text-mute underline" disabled={pending} onClick={() => save("")}>Clear</button></div>}
      {!confirmed && suggestions.map((s) => <button key={s.key} disabled={pending} onClick={() => save(s.key)} title={s.title} className="btn mr-1.5 h-7 px-2 text-xs">It's {s.key}</button>)}
      <div className="flex items-center gap-1.5">
        <input className="input h-7 w-32 text-xs" placeholder="Other ticket key" aria-label="Ticket key the bug came from" value={other} onChange={(e) => setOther(e.target.value.toUpperCase())} />
        <button className="btn h-7 px-2 text-xs" disabled={pending || !other.trim()} onClick={() => { save(other.trim()); setOther(""); }}>Set</button>
      </div>
      {err && <div role="alert" className="text-neon-red">{err}</div>}
    </div>
  );
}
