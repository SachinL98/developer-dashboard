"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ago = (iso: string | null, now: number) => {
  if (!iso) return "not synced yet";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

/**
 * Realtime indicator + poll fallback. Jira webhooks push changes into the database; this asks the server for any
 * changes every 30 s while the tab is visible (the server collapses concurrent viewers into one Jira call) and refreshes.
 */
export function LiveSync({ enabled, lastSync, showStatus = true }: { enabled: boolean; lastSync: string | null; showStatus?: boolean }) {
  const router = useRouter();
  const [last, setLast] = useState(lastSync);
  const [now, setNow] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => { setLast(lastSync); }, [lastSync]);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const poll = async () => {
      if (stop || document.visibilityState !== "visible") return;
      const r: { ok: boolean; error?: string; changed?: number; lastSync?: string | null } | null = await fetch("/api/live-sync", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      if (!r || stop) return;
      if (!r.ok) { setErr(r.error ?? "Sync failed"); return; }
      setErr(null);
      if (r.lastSync) setLast(r.lastSync);
      if ((r.changed ?? 0) > 0) router.refresh();
    };
    const t = setInterval(poll, 30_000);
    const vis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [enabled, router]);

  if (!showStatus) return null; // developers get the live updates, but not the integration details
  if (!enabled) return <span className="chip" title="An admin needs to connect Jira in Settings to show the real board">Demo data · Jira not connected</span>;
  return (
    <span className={`chip ${err ? "text-neon-red" : ""}`} title={err ?? "Updates arrive from Jira by webhook, with a 30 s poll as fallback"}>
      <span className={`h-1.5 w-1.5 rounded-full ${err ? "bg-neon-red" : "bg-neon-lime"}`} /> {err ? "Jira sync error" : `Live from Jira · ${now ? ago(last, now) : "…"}`}
    </span>
  );
}
