"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Printer, Sparkles } from "lucide-react";
import { generateOneOnOneAction } from "@/app/(app)/actions";

export function OneOnOneActions({ devId, hasReport, aiReady }: { devId: string; hasReport: boolean; aiReady: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = () => start(async () => { setErr(null); const r = await generateOneOnOneAction(devId); if (!r.ok) setErr(r.error); router.refresh(); });
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button className="btn-primary" disabled={pending} onClick={run}>{pending ? <><Loader2 size={14} className="animate-spin" /> Writing the report…</> : <><Sparkles size={14} /> {hasReport ? "Refresh with latest data" : "Generate my report"}</>}</button>
      {hasReport && <button className="btn" onClick={() => window.print()}><Printer size={14} /> Print or save as PDF</button>}
      {!aiReady && <span className="text-xs text-mute">No AI key yet: you get the numbers; add a key in Settings for written analysis.</span>}
      {err && <span role="alert" className="text-sm text-neon-red">{err}</span>}
    </div>
  );
}
