"use client";
import { useState, useTransition } from "react";
import { saveNotifyPrefsAction } from "@/app/(app)/actions";

export function NotifyPrefsCard({ notifyEmail, notifyDiscord, discordId, email }: { notifyEmail: boolean; notifyDiscord: boolean; discordId: string; email: string }) {
  const [v, setV] = useState({ notifyEmail, notifyDiscord, discordId });
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card-pad space-y-3">
      <div className="h-section">Alerts</div>
      <p className="text-sm text-mute">Get a message when you have overdue tickets, and a reminder if your work day has not started.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.notifyEmail} onChange={(e) => setV({ ...v, notifyEmail: e.target.checked })} /> Email me at <b className="font-medium">{email}</b></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.notifyDiscord} onChange={(e) => setV({ ...v, notifyDiscord: e.target.checked })} /> Message me on Discord</label>
      <div className="max-w-sm"><label className="label" htmlFor="discordId">Your Discord user id</label>
        <input id="discordId" className="input" inputMode="numeric" placeholder="e.g. 123456789012345678" value={v.discordId} onChange={(e) => setV({ ...v, discordId: e.target.value })} />
        <p className="mt-1 text-xs text-mute">In Discord open Settings, then Advanced, and turn on Developer Mode. Then right-click your name and choose Copy User ID.</p></div>
      <div className="flex items-center gap-3"><button className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await saveNotifyPrefsAction(v); setMsg(r.ok ? { t: "Saved." } : { t: r.error, bad: true }); })}>Save</button>{msg && <span className={`text-sm ${msg.bad ? "text-neon-red" : "text-neon-lime"}`} role="status">{msg.t}</span>}</div>
    </div>
  );
}
