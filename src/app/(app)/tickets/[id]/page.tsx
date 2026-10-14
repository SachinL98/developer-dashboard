import { fg, tint } from "@/lib/theme";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { STATUS_META, STATUS_ORDER, type StatusKey } from "@/lib/workflow";
import { PageHeader, StatusBadge, TypeDot, PriorityTag, Avatar, Progress } from "@/components/ui";
import { TicketControls } from "@/components/TicketControls";
import { ReviewPanel } from "@/components/ReviewPanel";
import { fmtDay, fmtDur, fmtTime } from "@/lib/time";
import { sumEntries } from "@/lib/analytics";
import { ExternalLink, GitPullRequest } from "lucide-react";
import clsx from "clsx";
import { jiraBrowseUrl } from "@/lib/integrations/jira";

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await db.ticket.findFirst({
    where: { OR: [{ id }, { key: id }] },
    include: { assignee: true, project: true, sprint: true, transitions: { orderBy: { at: "asc" }, include: { by: true } }, timeEntries: { orderBy: { startedAt: "desc" }, include: { developer: true } }, progressLogs: { orderBy: { at: "desc" } }, reviews: { orderBy: { createdAt: "desc" } }, votes: { include: { developer: true } } },
  });
  if (!t) notFound();
  const me = await requireUser();
  const [devs, sprints] = await Promise.all([db.developer.findMany({ orderBy: { name: "asc" } }), db.sprint.findMany({ where: { state: { not: "CLOSED" } }, orderBy: { startDate: "asc" } })]);
  const jiraHref = t.jiraKey ? await jiraBrowseUrl(t.jiraKey) : null;
  const logged = sumEntries(t.timeEntries);
  const running = t.timeEntries.some((e) => !e.endedAt && e.developerId === me?.id);
  const idx = STATUS_ORDER.indexOf(t.status as StatusKey);
  const visited = new Set([t.status, ...t.transitions.map((x) => x.to), ...t.transitions.map((x) => x.from)]);

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} sub={<span className="flex flex-wrap items-center gap-3"><span className="font-mono">{t.key}</span><span style={{ color: fg(t.project.color) }}>{t.project.name}</span><TypeDot type={t.type} /><PriorityTag p={t.priority} />{t.sprint && <span>{t.sprint.name}</span>}</span>}
        actions={<>{jiraHref && <a className="btn" href={jiraHref} target="_blank" rel="noreferrer">Jira <ExternalLink size={13} /></a>}{t.prUrl && <a className="btn" href={t.prUrl} target="_blank"><GitPullRequest size={14} /> PR #{t.prNumber} <ExternalLink size={13} /></a>}</>} />

      <div className="card-pad overflow-x-auto">
        <div className="flex min-w-[820px] items-center">
          {STATUS_ORDER.map((s, i) => {
            const m = STATUS_META[s]; const current = s === t.status; const past = i < idx && visited.has(s);
            return (
              <div key={s} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={clsx("grid h-7 w-7 place-items-center rounded-full border text-[11px] font-mono", current && "shadow-glow")} style={{ borderColor: current || past ? m.color : "rgb(var(--line))", background: current ? m.color : past ? tint(m.color, 13) : "transparent", color: current ? "#07090f" : past ? fg(m.color) : "rgb(var(--mute))" }}>{i + 1}</div>
                  <span className={clsx("w-16 text-center text-[10px] leading-tight", current ? "text-ink" : "text-mute")}>{m.label}</span>
                </div>
                {i < STATUS_ORDER.length - 1 && <div className="mb-5 h-px flex-1" style={{ background: i < idx ? m.color : "rgb(var(--line))" }} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <div className="card-pad">
            <div className="h-section mb-2">Description</div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/90">{t.description || "No description."}</p>
            {t.labels.length > 0 && <div className="mt-3 flex gap-1.5">{t.labels.map((l) => <span key={l} className="chip">{l}</span>)}</div>}
          </div>

          <div className="card-pad">
            <div className="h-section mb-3">PR review</div>
            <ReviewPanel canLead={atLeast(me.access, "LEAD")} ticketId={t.id} status={t.status} reviews={t.reviews.map((r) => ({ id: r.id, kind: r.kind, round: r.round, passed: r.passed, items: r.items as any, createdAt: r.createdAt.toISOString(), status: r.status, source: r.source, summary: r.summary, findings: (r.findings ?? []) as any, model: r.model, error: r.error, truncated: r.truncated, trigger: r.trigger }))} />
          </div>

          <div className="card-pad">
            <div className="h-section mb-3">History</div>
            <ol className="relative space-y-3 border-l border-line pl-5">
              {t.transitions.map((x) => (
                <li key={x.id} className="relative text-sm">
                  <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full" style={{ background: STATUS_META[x.to as StatusKey].color }} />
                  <StatusBadge status={x.to} /> <span className="text-xs text-mute">{fmtDay(x.at)} {fmtTime(x.at)}{x.by ? ` · ${x.by.name}` : ""}</span>
                </li>
              ))}
              {!t.transitions.length && <li className="text-sm text-mute">Created {fmtDay(t.createdAt)}.</li>}
            </ol>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card-pad"><TicketControls canLead={atLeast(me.access, "LEAD")} id={t.id} status={t.status} progress={t.progressPct} timerRunning={running} assigneeId={t.assigneeId} devs={devs.map((d) => ({ id: d.id, name: d.name }))} prUrl={t.prUrl} points={t.storyPoints} estimateHrs={t.estimateHrs} sprintId={t.sprintId} sprints={sprints.map((s) => ({ id: s.id, name: s.name }))} /></div>

          <div className="card-pad">
            <div className="h-section mb-2">Time</div>
            <div className="flex items-end justify-between"><span className="font-mono text-2xl">{fmtDur(logged)}</span><span className="text-xs text-mute">{t.estimateHrs ? `of ${t.estimateHrs}h estimate` : "no estimate"}</span></div>
            {t.estimateHrs ? <Progress className="mt-2" pct={(logged / 3_600_000 / t.estimateHrs) * 100} color={logged / 3_600_000 > t.estimateHrs ? "#fb7185" : "#6ee7ff"} /> : null}
            <ul className="mt-4 space-y-2 text-xs">
              {t.timeEntries.slice(0, 8).map((e) => (
                <li key={e.id} className="flex items-center gap-2"><Avatar name={e.developer.name} hue={e.developer.avatarHue} size={20} /><span className="flex-1 text-mute">{fmtDay(e.startedAt)} {fmtTime(e.startedAt)}</span><span className="font-mono">{e.endedAt ? fmtDur(e.endedAt.getTime() - e.startedAt.getTime()) : <span className="text-neon-lime">running</span>}</span></li>
              ))}
            </ul>
          </div>

          {t.progressLogs.length > 0 && (
            <div className="card-pad">
              <div className="h-section mb-2">Progress log</div>
              <ul className="space-y-2 text-sm">{t.progressLogs.map((l) => <li key={l.id} className="flex gap-2"><span className="font-mono text-neon-violet">{l.pct}%</span><span className="flex-1 text-mute">{l.note || "—"}</span><span className="text-xs text-mute">{fmtTime(l.at)}</span></li>)}</ul>
            </div>
          )}
          {t.assignee && <Link href={`/team/${t.assignee.id}`} className="card-pad flex items-center gap-3 hover:border-neon/40"><Avatar name={t.assignee.name} hue={t.assignee.avatarHue} size={36} /><div><div className="text-sm">{t.assignee.name}</div><div className="text-xs text-mute">{t.assignee.role}</div></div></Link>}
        </div>
      </div>
    </div>
  );
}
