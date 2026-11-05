"use client";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Sparkles, Loader2 } from "lucide-react";
import Link from "next/link";
import { reviewEstimateAction } from "@/app/(app)/actions";
import type { EstimateReview as Review } from "@/lib/insights";

const VERDICT = {
  too_low: { text: "Looks too low", cls: "bg-neon-red/10 text-neon-red" },
  too_high: { text: "Looks too high", cls: "bg-neon-amber/10 text-neon-amber" },
  about_right: { text: "Looks about right", cls: "bg-neon-lime/10 text-neon-lime" },
  no_estimate: { text: "No estimate yet", cls: "bg-panel2 text-mute" },
} as const;

export function EstimateReview({ ticketId, ready, initial, onUse, canApply }: { ticketId: string; ready: boolean; initial: Review | null; onUse?: (hours: number) => void; canApply?: boolean }) {
  const [res, setRes] = useState<Review | null>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ask = () => start(async () => { setErr(null); const r = await reviewEstimateAction(ticketId); if (r.ok) setRes(r.review); else setErr(r.error); });
  return (
    <div className="card-pad">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="h-section flex items-center gap-2"><Sparkles size={14} className="text-neon" /> AI estimate review</span>
        <button className="btn" disabled={pending || !ready} onClick={ask}>{pending ? <><Loader2 size={14} className="animate-spin" /> Reviewing…</> : res ? "Review again" : "Review estimate"}</button>
      </div>
      {!ready && <p className="text-sm text-mute">Add an AI key (Claude, Gemini or OpenAI) in <Link href="/settings" className="text-neon">Settings</Link> to get an AI review of this estimate.</p>}
      {ready && !res && !err && <p className="text-sm text-mute">The AI compares this estimate with similar finished tickets and explains whether it looks too low or too high.</p>}
      {err && <p className="text-sm text-neon-red">{err}</p>}
      {res && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className={clsx("rounded-md px-2.5 py-1 text-sm font-medium", VERDICT[res.verdict].cls)}>{VERDICT[res.verdict].text}</span>
            <span className="text-sm text-mute">{res.currentHours != null ? `Current ${res.currentHours}h → ` : ""}suggested <b className="text-ink">{res.suggestedHours}h</b> (range {res.rangeLow}–{res.rangeHigh}h) · {res.confidence} confidence</span>
            {canApply && onUse && <button className="btn ml-auto" onClick={() => onUse(res.suggestedHours)}>Apply {res.suggestedHours}h</button>}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm">{res.reasoning.map((r, i) => <li key={i}>{r}</li>)}</ul>
          {res.risks.length > 0 && <div><div className="mb-1 text-xs font-medium text-mute">What could push it higher</div><ul className="list-disc space-y-1 pl-5 text-sm">{res.risks.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
          <p className="text-xs text-mute">AI guidance based on past tickets. Treat it as a second opinion. Generated {new Date(res.generatedAt).toLocaleString()}.</p>
        </div>
      )}
    </div>
  );
}
