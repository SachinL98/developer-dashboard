import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { setupChecklist, atlassianConfigured } from "@/lib/integrations/status";
import { googleOAuthConfigured } from "@/lib/integrations/google";
import { SyncButtons } from "@/components/SyncButtons";
import { ProfileForm } from "@/components/ProfileForm";
import { headers } from "next/headers";
import { CheckCircle2, CircleDashed, Link2 } from "lucide-react";
import { GOOGLE_WORK_SCOPES } from "@/lib/auth/scopes";
import { StatusMapEditor } from "@/components/StatusMapEditor";
import { cachedBoardInfo, jiraReady, loadStatusMap, statusFromJira } from "@/lib/integrations/jira";

export const dynamic = "force-dynamic";

const NOTES: Record<string, string> = {
  google_not_configured: "Google isn't configured on the server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).",
  atlassian_not_configured: "Jira OAuth isn't configured on the server (ATLASSIAN_CLIENT_ID / ATLASSIAN_CLIENT_SECRET).",
};

export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const sp = await searchParams;
  const me = await requireUser();
  const conns = await db.connection.findMany({ where: { userId: me.id } });
  const get = (p: string) => conns.find((c) => c.provider === p);
  const google = get("GOOGLE"), jira = get("JIRA");
  const googleScopes = (google?.scope ?? "").split(" ");
  const googleFull = !!google && GOOGLE_WORK_SCOPES.every((s) => googleScopes.includes(s));
  const isAdmin = atLeast(me.access, "ADMIN");
  const h = await headers();
  const jiraLive = await jiraReady();
  const board = jiraLive && atLeast(me.access, "LEAD") ? await cachedBoardInfo() : null;
  const statusMap = board ? await loadStatusMap() : {};
  const origin = process.env.APP_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const cards = [
    { id: "GOOGLE", name: "Google Calendar & Meet", on: googleFull, ready: googleOAuthConfigured(), href: "/api/auth/google/connect", detail: googleFull ? "Create Meet events as you, link calendar events, import Meet transcripts into notes." : "Grants Calendar events and read access to Meet transcripts.", missing: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" },
    { id: "JIRA", name: "Jira Cloud", on: !!jira, ready: atlassianConfigured(), href: "/api/auth/atlassian/connect", detail: jira ? `Connected to ${jira.siteUrl}. Tickets, sprints and transitions sync as you.` : "Syncs tickets, sprints, transitions, estimates and worklogs as your Jira user.", missing: "ATLASSIAN_CLIENT_ID / ATLASSIAN_CLIENT_SECRET" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Integrations" sub="Connect your own accounts. Actions in Jira and Google are done as you, with your permissions."
        actions={atLeast(me.access, "LEAD") ? <SyncButtons what="jira" /> : undefined} />
      {sp.connected && <div className="rounded-lg border border-neon-lime/40 bg-neon-lime/10 px-4 py-2 text-sm text-neon-lime">{sp.connected === "jira" ? "Jira" : "Google"} connected.</div>}
      {sp.error && <div role="alert" className="rounded-lg border border-neon-red/40 bg-neon-red/10 px-4 py-2 text-sm text-neon-red">{NOTES[sp.error] ?? sp.error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <div key={c.id} className="card-pad">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-medium">{c.on ? <CheckCircle2 size={18} className="text-neon-lime" /> : <CircleDashed size={18} className="text-mute" />}{c.name}</div>
              {c.on ? (
                <form action="/api/auth/disconnect" method="post"><input type="hidden" name="provider" value={c.id} /><button className="btn">Disconnect</button></form>
              ) : c.ready ? <a className="btn-primary" href={c.href}><Link2 size={14} /> Connect</a> : <span className="chip">server not set up</span>}
            </div>
            <p className="mt-2 text-sm text-mute">{c.detail}</p>
            {!c.ready && <p className="mt-2 text-xs text-neon-amber">An admin must set {c.missing} first (see the checklist below).</p>}
            {c.id === "GOOGLE" && google && !googleFull && <p className="mt-2 text-xs text-neon-amber">Connected without Calendar/Meet permissions. Reconnect and tick every permission.</p>}
          </div>
        ))}
      </div>

      <div className="card-pad">
        <div className="h-section mb-3">My profile</div>
        <ProfileForm userId={me.id} role={me.role} capacityHrs={me.capacityHrs} githubLogin={me.githubLogin ?? ""} email={me.email} access={me.access} />
      </div>

      {jiraLive && atLeast(me.access, "LEAD") && (
        <div className="card-pad">
          <div className="h-section mb-3">Jira board → workflow mapping</div>
          {board ? (
            <StatusMapEditor canEdit={isAdmin} initial={statusMap as Record<string, string>} fetchedAt={board.fetchedAt}
              unit={board.estimation.mode === "points" ? `story points (${board.estimation.field})` : "original estimate (hours)"}
              columns={board.columns.map((c) => ({ name: c.name, statuses: c.statuses.map((s) => ({ name: s.name, auto: statusFromJira(s.name, {}, s.category) })) }))} />
          ) : <p className="text-sm text-mute">The real board hasn't been read yet. Press <b>Sync Jira</b> above to load its columns, statuses and estimation unit.</p>}
        </div>
      )}

      {isAdmin && (
        <div className="card-pad space-y-5">
          <div className="h-section">Server setup checklist (admins)</div>
          <div className="grid gap-4 md:grid-cols-2">
            {setupChecklist().map((g) => (
              <div key={g.group}><div className="mb-2 text-sm font-medium">{g.group}</div>
                <ul className="space-y-1.5">{g.items.map((i) => (
                  <li key={i.name} className="flex items-start gap-2 text-xs">{i.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-neon-lime" /> : <CircleDashed size={14} className="mt-0.5 shrink-0 text-neon-amber" />}
                    <span><code className="text-ink">{i.name}</code> <span className="text-mute">{i.hint}</span></span></li>))}</ul></div>
            ))}
          </div>
          <div className="space-y-1 rounded-xl border border-line bg-panel2 p-4 text-xs text-mute">
            <div className="h-section mb-1">URLs to register</div>
            <div>Google OAuth redirect URI: <code className="text-ink">{origin}/api/auth/google/callback</code></div>
            <div>Atlassian callback URL: <code className="text-ink">{origin}/api/auth/atlassian/callback</code></div>
            <div>Jira webhook (realtime; events: issue created/updated/deleted, sprint created/started/closed/updated, board configuration changed): <code className="text-ink">{origin}/api/webhooks/jira?secret=&lt;JIRA_WEBHOOK_SECRET&gt;</code></div>
            <div>GitHub webhook (pull_request): <code className="text-ink">{origin}/api/webhooks/github</code></div>
            <div>Cron (every 10 min): <code className="text-ink">GET {origin}/api/cron/sync</code> and <code className="text-ink">/api/cron/transcripts</code> with <code>Authorization: Bearer &lt;CRON_SECRET&gt;</code></div>
          </div>
          <Link href="/admin/users" className="btn w-fit">Manage users and roles</Link>
        </div>
      )}
    </div>
  );
}
