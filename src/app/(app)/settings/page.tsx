import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { setupGuide, atlassianConfigured } from "@/lib/integrations/status";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { CopyText } from "@/components/CopyText";
import { googleOAuthConfigured } from "@/lib/integrations/google";
import { SyncButtons } from "@/components/SyncButtons";
import { ProfileForm } from "@/components/ProfileForm";
import { headers } from "next/headers";
import { CheckCircle2, CircleDashed, Link2 } from "lucide-react";
import { GOOGLE_WORK_SCOPES } from "@/lib/auth/scopes";
import { ClaudeKeyCard } from "@/components/ClaudeKeyCard";
import { StatusMapEditor } from "@/components/StatusMapEditor";
import { cachedBoardInfo, jiraReady, loadStatusMap, statusFromJira } from "@/lib/integrations/jira";

export const dynamic = "force-dynamic";

const NOTES: Record<string, string> = {
  admin_only: "Only an admin can connect Jira and Google.",
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

  const cards = !isAdmin ? [] : [
    { id: "GOOGLE", name: "Google Calendar & Meet", on: googleFull, ready: googleOAuthConfigured(), href: "/api/auth/google/connect", detail: googleFull ? "Create Meet events as you, link calendar events, import Meet transcripts into notes." : "Grants Calendar events and read access to Meet transcripts.", missing: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET" },
    { id: "JIRA", name: "Jira Cloud", on: !!jira, ready: atlassianConfigured(), href: "/api/auth/atlassian/connect", detail: jira ? `Connected to ${jira.siteUrl}. Tickets, sprints and transitions sync as you.` : "Syncs tickets, sprints, transitions, estimates and worklogs as your Jira user.", missing: "ATLASSIAN_CLIENT_ID / ATLASSIAN_CLIENT_SECRET" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" sub={isAdmin ? "Connect Jira and Google for the team, add your Claude key, and manage your profile and password." : "Add your Claude key, and manage your profile and password."}
        actions={atLeast(me.access, "LEAD") ? <SyncButtons what="jira" /> : undefined} />
      {isAdmin && sp.connected && <div className="rounded-lg border border-neon-lime/40 bg-neon-lime/10 px-4 py-2 text-sm text-neon-lime">{sp.connected === "jira" ? "Jira" : "Google"} connected.</div>}
      {sp.error && <div role="alert" className="rounded-lg border border-neon-red/40 bg-neon-red/10 px-4 py-2 text-sm text-neon-red">{NOTES[sp.error] ?? sp.error}</div>}

      {isAdmin && <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <div key={c.id} className="card-pad">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-medium">{c.on ? <CheckCircle2 size={18} className="text-neon-lime" /> : <CircleDashed size={18} className="text-mute" />}{c.name}</div>
              {c.on ? (
                <form action="/api/auth/disconnect" method="post"><input type="hidden" name="provider" value={c.id} /><button className="btn">Disconnect</button></form>
              ) : c.ready ? <a className="btn-primary" href={c.href}><Link2 size={14} /> Connect</a> : <span className="chip">Not available</span>}
            </div>
            <p className="mt-2 text-sm text-mute">{c.detail}</p>
            {!c.ready && <p className="mt-2 text-xs text-neon-amber">Ask an admin to finish setup ({c.missing}).</p>}
            {c.id === "GOOGLE" && google && !googleFull && <p className="mt-2 text-xs text-neon-amber">Connected without Calendar/Meet permissions. Reconnect and tick every permission.</p>}
          </div>
        ))}
      </div>}

      <ClaudeKeyCard connected={!!get("CLAUDE")} serverFallback={!!process.env.ANTHROPIC_API_KEY} />

      <div className="card-pad">
        <div className="h-section mb-3">Change password</div>
        <div className="max-w-md"><ChangePasswordForm /></div>
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

      {isAdmin && (() => {
        const steps = setupGuide(origin);
        const doneCount = steps.filter((x) => x.done).length;
        const next = steps.findIndex((x) => !x.done && !x.optional);
        return (
          <div className="card-pad space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><div className="h-section">Setup guide</div><p className="mt-1 text-sm text-mute">Follow the steps in order. {doneCount} of {steps.length} done.</p></div>
              <div className="flex flex-wrap gap-2"><Link href="/admin/users" className="btn">Users</Link><Link href="/admin/meetings" className="btn">Meetings</Link><Link href="/admin/workspace" className="btn">Workspace</Link><Link href="/admin/review" className="btn">Code review</Link></div>
            </div>
            <ol className="space-y-2">
              {steps.map((st, i) => (
                <li key={st.id}>
                  <details open={i === next} className="group rounded-lg border border-line">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${st.done ? "bg-neon-lime/15 text-neon-lime" : i === next ? "bg-neon text-on-accent" : "bg-panel2 text-mute"}`}>{st.done ? <CheckCircle2 size={16} /> : i + 1}</span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{st.title}{st.optional && <span className="ml-2 text-xs font-normal text-mute">Optional</span>}</span><span className="block text-xs text-mute">{st.summary}</span></span>
                      <span className="text-xs text-mute">{st.done ? "Done" : i === next ? "Do this next" : ""}</span>
                    </summary>
                    <div className="space-y-3 border-t border-line px-4 py-4">
                      <ol className="list-decimal space-y-1.5 pl-5 text-sm">{st.steps.map((x, k) => <li key={k}>{x}</li>)}</ol>
                      {st.copy && <div className="space-y-2">{st.copy.map((c) => <CopyText key={c.label} label={c.label} value={c.value} />)}</div>}
                      <div className="flex flex-wrap gap-1.5">{st.vars.map((x) => <span key={x.name} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${x.ok ? "bg-neon-lime/10 text-neon-lime" : "bg-panel2 text-mute"}`}>{x.ok ? "✓" : "○"} <code>{x.name}</code></span>)}</div>
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </div>
        );
      })()}
    </div>
  );
}
