"use client";
import { useState, useTransition } from "react";
import { reconcilePeopleAction } from "@/app/(app)/actions";

/** One click to merge people who exist twice, such as a Jira entry and the same person's account. */
export function ReconcileButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className="btn" disabled={pending} onClick={() => start(async () => {
        const r = await reconcilePeopleAction();
        setMsg(!r.ok ? { t: r.error ?? "Failed", bad: true } : { t: r.merged ? `Merged ${r.merged} duplicate${r.merged === 1 ? "" : "s"}.` : "No clear duplicates found. Use “Same person as…” on a row for the rest." });
      })}>{pending ? "Checking…" : "Find and merge duplicates"}</button>
      {msg && <span role="status" className={`text-sm ${msg.bad ? "text-neon-red" : "text-neon-lime"}`}>{msg.t}</span>}
    </div>
  );
}
