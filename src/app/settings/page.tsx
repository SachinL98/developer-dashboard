import { PageHeader } from "@/components/ui";
import { integrationStatus } from "@/lib/integrations/status";
import { SyncButtons } from "@/components/SyncButtons";
import { CheckCircle2, CircleDashed } from "lucide-react";

export default function Settings() {
  const items = integrationStatus();
  return (
    <div className="space-y-6">
      <PageHeader title="Integrations" sub="Credentials are read from environment variables. Without them the app runs on seeded demo data." />
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((i) => (
          <div key={i.id} className="card-pad">
            <div className="flex items-center justify-between"><div className="flex items-center gap-2 font-medium">{i.configured ? <CheckCircle2 size={18} className="text-neon-lime" /> : <CircleDashed size={18} className="text-mute" />}{i.name}</div>
              {(i.id === "jira" || i.id === "github") && <SyncButtons what={i.id as "jira" | "github"} disabled={!i.configured} />}</div>
            <p className="mt-2 text-sm text-mute">{i.does}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{i.env.map((e) => <code key={e} className="rounded bg-panel2 px-1.5 py-0.5 font-mono text-[11px] text-mute">{e}</code>)}</div>
          </div>
        ))}
      </div>
      <div className="card-pad text-sm text-mute">
        <div className="h-section mb-2">Webhooks</div>
        <ul className="space-y-1">
          <li><code className="text-ink">POST /api/webhooks/github</code> — <code>pull_request</code> events link PRs to tickets by key in title/branch (optional <code>GITHUB_WEBHOOK_SECRET</code>).</li>
          <li><code className="text-ink">POST /api/webhooks/jira?secret=…</code> — issue-updated events mirror forward-only status changes (optional <code>JIRA_WEBHOOK_SECRET</code>).</li>
        </ul>
      </div>
    </div>
  );
}
