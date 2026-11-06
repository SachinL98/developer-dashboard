"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { generateQualityAction } from "@/app/(app)/actions";

export function QualityActions({ hasInsight, aiReady }: { hasInsight: boolean; aiReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn-primary" disabled={pending || !aiReady} onClick={() => start(async () => { setErr(null); const r = await generateQualityAction(); if (!r.ok) setErr(r.error); router.refresh(); })}>
        {pending ? <><Loader2 size={14} className="animate-spin" /> Analysing…</> : <><Sparkles size={14} /> {hasInsight ? "Refresh AI analysis" : "Run AI analysis"}</>}
      </button>
      {!aiReady && <span className="text-xs text-mute">Add an AI key (Claude, Gemini or OpenAI) in Settings to get the written analysis. The numbers below work without it.</span>}
      {err && <span role="alert" className="text-sm text-neon-red">{err}</span>}
    </div>
  );
}
