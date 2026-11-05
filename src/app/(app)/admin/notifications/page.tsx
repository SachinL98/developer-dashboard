import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { atLeast } from "@/lib/permissions";
import { emailProvider } from "@/lib/notify/email";
import { discordConfigured } from "@/lib/notify/discord";
import { getNotifyConfig } from "@/lib/notify/run";
import { NotificationAdmin } from "@/components/NotificationAdmin";
import { fmtDay, fmtTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminNotifications() {
  const me = await requireUser();
  if (!atLeast(me.access, "ADMIN")) redirect("/");
  const [cfg, log] = await Promise.all([getNotifyConfig(), db.notificationLog.findMany({ orderBy: { createdAt: "desc" }, take: 25 })]);
  const people = await db.developer.findMany({ where: { id: { in: [...new Set(log.map((l) => l.userId))] } }, select: { id: true, name: true } });
  const name = new Map(people.map((p) => [p.id, p.name]));
  const provider = emailProvider();
  return (
    <div className="space-y-6">
      <PageHeader title="Alerts" sub="Email and Discord messages for overdue tickets and for people who have not started their day." />
      <NotificationAdmin cfg={cfg} email={provider === "zeptomail" ? "ZeptoMail" : provider === "zoho" ? "Zoho Mail (SMTP)" : null} discord={discordConfigured()} dm={!!process.env.DISCORD_BOT_TOKEN} />
      <div className="card overflow-x-auto">
        <div className="p-4 pb-0"><div className="h-section">Recent alerts</div></div>
        <table className="mt-2 w-full min-w-[600px] text-sm">
          <thead className="text-left text-xs text-mute"><tr><th className="p-3 font-medium">When</th><th className="font-medium">Person</th><th className="font-medium">Alert</th><th className="font-medium">Result</th><th className="pr-3 font-medium">Email / Discord</th></tr></thead>
          <tbody>{log.map((l) => { const ch = (l.channels ?? {}) as Record<string, string>; return (
            <tr key={l.id} className="border-t border-line/60"><td className="p-3 text-xs text-mute">{fmtDay(l.createdAt)} {fmtTime(l.createdAt)}</td><td>{name.get(l.userId) ?? "—"}</td><td>{l.summary ?? l.kind}</td>
              <td><span className={`chip ${l.status === "sent" ? "text-neon-lime" : l.status === "failed" ? "text-neon-red" : ""}`}>{l.status}</span></td><td className="pr-3 text-xs text-mute">{ch.email ?? "—"} · {ch.discord ?? "—"}</td></tr>); })}
            {!log.length && <tr><td className="p-4 text-mute" colSpan={5}>Nothing has been sent yet.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}
