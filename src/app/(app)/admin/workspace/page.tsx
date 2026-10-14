import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { WorkspaceSettings } from "@/components/WorkspaceSettings";
import { getWorkspace } from "@/lib/config";
import { setupChecklist } from "@/lib/integrations/status";
import { CheckCircle2, CircleDashed } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminWorkspace() {
  const [cfg, projects] = await Promise.all([getWorkspace(), db.project.findMany({ orderBy: { key: "asc" } })]);
  const timezones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [cfg.timezone];
  return (
    <div className="space-y-6">
      <PageHeader title="Workspace settings" sub="Team hours, sprint cadence, capacity defaults and where Jira and GitHub point." />
      <WorkspaceSettings cfg={cfg} timezones={timezones} projects={projects.map((p) => ({ id: p.id, key: p.key, name: p.name, repo: p.repo ?? "" }))} />
      <div className="card-pad space-y-4">
        <div className="h-section">Secrets and server setup (read-only)</div>
        <p className="text-xs text-mute">Tokens, client secrets and webhook secrets live in the server's environment variables and are never stored in the database or shown here. This only shows whether each one is set.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {setupChecklist().map((g) => (
            <div key={g.group}><div className="mb-2 text-sm font-medium">{g.group}</div>
              <ul className="space-y-1.5">{g.items.map((i) => (
                <li key={i.name} className="flex items-start gap-2 text-xs">{i.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-neon-lime" /> : <CircleDashed size={14} className="mt-0.5 shrink-0 text-neon-amber" />}
                  <span><code className="text-ink">{i.name}</code> <span className="text-mute">{i.ok ? "set" : "not set"} · {i.hint}</span></span></li>))}</ul></div>
          ))}
        </div>
      </div>
    </div>
  );
}
