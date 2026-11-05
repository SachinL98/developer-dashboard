"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyText({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel2 px-3 py-2">
      <span className="text-xs font-medium text-mute">{label}</span>
      <code className="min-w-0 flex-1 break-all text-xs text-ink">{value}</code>
      <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }}>
        {done ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
      </button>
    </div>
  );
}
