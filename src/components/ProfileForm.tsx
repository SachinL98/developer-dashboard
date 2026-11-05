"use client";
import { useState, useTransition } from "react";
import { updateProfileAction } from "@/app/(app)/actions";

export function ProfileForm(p: { userId: string; role: string; capacityHrs: number; githubLogin: string; email: string; access: string }) {
  const [v, setV] = useState({ role: p.role, capacityHrs: String(p.capacityHrs), githubLogin: p.githubLogin });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <div><label className="label">Email</label><input className="input opacity-70" disabled value={p.email} /></div>
      <div><label className="label">Job title</label><input className="input" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} /></div>
      <div><label className="label">Productive hours / week</label><input className="input" inputMode="decimal" value={v.capacityHrs} onChange={(e) => setV({ ...v, capacityHrs: e.target.value })} /></div>
      <div><label className="label">GitHub username</label><input className="input" placeholder="octocat" value={v.githubLogin} onChange={(e) => setV({ ...v, githubLogin: e.target.value })} /></div>
      <div className="flex items-center gap-3 md:col-span-4">
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
          const r = await updateProfileAction(p.userId, { role: v.role, capacityHrs: Number(v.capacityHrs), githubLogin: v.githubLogin || null });
          setMsg(r.ok ? { t: "Saved" } : { t: r.error, bad: true });
        })}>Save profile</button>
        {msg && <span className={`text-sm ${msg.bad ? "text-neon-red" : "text-neon-lime"}`}>{msg.t}</span>}
        <span className="ml-auto text-xs text-mute">Access level: {p.access.toLowerCase()}</span>
      </div>
    </div>
  );
}
