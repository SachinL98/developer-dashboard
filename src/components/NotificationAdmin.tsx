"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { saveNotifyConfigAction, sendTestNotificationAction } from "@/app/(app)/actions";

export function NotificationAdmin({ cfg, email, discord, dm }: { cfg: { overdue: boolean; startReminder: boolean; graceMin: number }; email: string | null; discord: boolean; dm: boolean }) {
  const [v, setV] = useState(cfg);
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const Row = ({ ok, label, detail }: { ok: boolean; label: string; detail: string }) => <li className="flex items-start gap-2 text-sm">{ok ? <CheckCircle2 size={16} className="mt-0.5 text-neon-lime" /> : <CircleDashed size={16} className="mt-0.5 text-mute" />}<span><span className="font-medium">{label}</span> <span className="text-mute">{detail}</span></span></li>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="card-pad space-y-3">
        <div className="h-section">Channels</div>
        <ul className="space-y-2">
          <Row ok={!!email} label="Email" detail={email ? `sending through ${email}` : "not set up. Add ZEPTOMAIL_TOKEN, or ZOHO_SMTP_USER and ZOHO_SMTP_PASSWORD, plus EMAIL_FROM (see Settings, Setup guide)."} />
          <Row ok={discord} label="Discord" detail={discord ? (dm ? "bot direct messages (people need their Discord id in Settings), webhook as the fallback" : "channel webhook, mentioning people who saved their Discord id") : "not set up. Add DISCORD_BOT_TOKEN or DISCORD_WEBHOOK_URL."} />
        </ul>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button className="btn" disabled={pending || (!email && !discord)} onClick={() => start(async () => { const r = await sendTestNotificationAction(); setMsg(r.ok ? { t: `Test sent to you. Email: ${r.channels.email ?? "—"}. Discord: ${r.channels.discord ?? "—"}.` } : { t: r.error, bad: true }); router.refresh(); })}>Send a test to me</button>
          <span className="text-xs text-mute">Goes to your own email and Discord id.</span>
        </div>
      </div>
      <div className="card-pad space-y-3">
        <div className="h-section">Rules</div>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={v.overdue} onChange={(e) => setV({ ...v, overdue: e.target.checked })} /><span><b className="font-medium">Overdue tickets.</b> One message a day, once the work day has begun, listing tickets past their due date or in a sprint that has ended.</span></label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={v.startReminder} onChange={(e) => setV({ ...v, startReminder: e.target.checked })} /><span><b className="font-medium">Start-of-day reminder.</b> On a working day that is not leave or a holiday, if nobody has started a day or a timer this long after the work day begins.</span></label>
        <div className="flex items-center gap-2 text-sm"><label htmlFor="grace" className="text-mute">Wait</label><input id="grace" className="input w-20" inputMode="numeric" value={v.graceMin} onChange={(e) => setV({ ...v, graceMin: Number(e.target.value) || 0 })} /><span className="text-mute">minutes after the work day starts</span></div>
        <p className="text-xs text-mute">Nobody gets more than one of each per day. People on leave and on public holidays are skipped. Each person can switch email or Discord off in their own Settings.</p>
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await saveNotifyConfigAction(v); setMsg(r.ok ? { t: "Saved." } : { t: r.error, bad: true }); router.refresh(); })}>Save rules</button>
      </div>
      {msg && <p className={`text-sm lg:col-span-2 ${msg.bad ? "text-neon-red" : "text-neon-lime"}`} role="status">{msg.t}</p>}
    </div>
  );
}
