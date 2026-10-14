"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Save } from "lucide-react";
import { saveProjectAction, saveWorkspaceAction } from "@/app/(app)/actions";
import type { WorkspaceConfig } from "@/lib/config";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
interface Proj { id: string; key: string; name: string; repo: string }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-mute">{hint}</span>}</label>;
}

export function WorkspaceSettings({ cfg, timezones, projects }: { cfg: WorkspaceConfig; timezones: string[]; projects: Proj[] }) {
  const [v, setV] = useState(cfg);
  const [projs, setProjs] = useState(projects);
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const num = (s: string) => (s === "" ? NaN : Number(s));
  const say = (ok: boolean, t: string) => setMsg({ t, bad: !ok });

  return (
    <div className="space-y-6">
      {msg && <div role="status" className={clsx("rounded-lg border px-4 py-2 text-sm", msg.bad ? "border-neon-red/40 text-neon-red" : "border-neon-lime/30 text-neon-lime")}>{msg.t}</div>}

      <div className="card-pad space-y-4">
        <div className="h-section">Team time and capacity</div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Timezone" hint="Meetings and work-day times use this."><input className="input" list="tzs" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} /><datalist id="tzs">{timezones.map((t) => <option key={t} value={t} />)}</datalist></Field>
          <Field label="Work day starts"><input type="time" className="input" value={v.workStart} onChange={(e) => setV({ ...v, workStart: e.target.value })} /></Field>
          <Field label="Work day ends"><input type="time" className="input" value={v.workEnd} onChange={(e) => setV({ ...v, workEnd: e.target.value })} /></Field>
          <Field label="Sprint length (days)"><input className="input" inputMode="numeric" value={Number.isNaN(v.sprintLengthDays) ? "" : v.sprintLengthDays} onChange={(e) => setV({ ...v, sprintLengthDays: num(e.target.value) })} /></Field>
          <Field label="Sprints start on"><select className="input" value={v.sprintStartWeekday} onChange={(e) => setV({ ...v, sprintStartWeekday: Number(e.target.value) })}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
          <Field label="Default hours / week per developer" hint="Given to people the first time they sign in."><input className="input" inputMode="decimal" value={Number.isNaN(v.defaultCapacityHrs) ? "" : v.defaultCapacityHrs} onChange={(e) => setV({ ...v, defaultCapacityHrs: num(e.target.value) })} /></Field>
          <Field label="Capacity buffer (%)" hint="Kept free when fitting a sprint."><input className="input" inputMode="decimal" value={Number.isNaN(v.bufferPct) ? "" : v.bufferPct} onChange={(e) => setV({ ...v, bufferPct: num(e.target.value) })} /></Field>
        </div>
      </div>

      <div className="card-pad space-y-4">
        <div className="h-section">Jira</div>
        <p className="text-xs text-mute">Which Jira project and board the dashboard works with. Each person connects their own Jira account in Integrations; columns and status mapping are in Integrations once Jira is synced.</p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Project key" hint="e.g. ATL"><input className="input" value={v.jira.projectKey} onChange={(e) => setV({ ...v, jira: { ...v.jira, projectKey: e.target.value.toUpperCase() } })} /></Field>
          <Field label="Scrum board id" hint="The number in the board URL"><input className="input" inputMode="numeric" value={v.jira.boardId} onChange={(e) => setV({ ...v, jira: { ...v.jira, boardId: e.target.value } })} /></Field>
          <Field label="Story points field" hint="Used when the board estimates in points"><input className="input" value={v.jira.storyPointsField} onChange={(e) => setV({ ...v, jira: { ...v.jira, storyPointsField: e.target.value } })} /></Field>
          <Field label="Sprint field"><input className="input" value={v.jira.sprintField} onChange={(e) => setV({ ...v, jira: { ...v.jira, sprintField: e.target.value } })} /></Field>
        </div>
      </div>

      <div className="card-pad space-y-4">
        <div className="h-section">GitHub</div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Field label="Organisation" hint="Used to list repos"><input className="input" value={v.github.org} onChange={(e) => setV({ ...v, github: { org: e.target.value } })} /></Field></div>
      </div>

      <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
        const r = await saveWorkspaceAction(v);
        say(r.ok, r.ok ? "Workspace settings saved." : r.error);
        router.refresh();
      })}><Save size={14} /> Save workspace settings</button>

      <div className="card-pad space-y-3">
        <div className="h-section">Projects and repositories</div>
        <ul className="space-y-2">
          {projs.map((p) => (
            <li key={p.id} className="flex flex-col gap-2 rounded-lg border border-line bg-panel2 p-3 sm:flex-row sm:items-center">
              <span className="font-mono text-xs text-mute sm:w-16">{p.key}</span>
              <input className="input" aria-label={`${p.key} name`} value={p.name} onChange={(e) => setProjs((l) => l.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} />
              <input className="input" aria-label={`${p.key} repository`} placeholder={`${v.github.org || "org"}/repo`} value={p.repo} onChange={(e) => setProjs((l) => l.map((x) => (x.id === p.id ? { ...x, repo: e.target.value } : x)))} />
              <button className="btn" disabled={pending} onClick={() => start(async () => { const r = await saveProjectAction(p.id, { name: p.name, repo: p.repo }); say(r.ok, r.ok ? `${p.key} saved.` : r.error); router.refresh(); })}>Save</button>
            </li>))}
        </ul>
      </div>
    </div>
  );
}
