import Link from "next/link";
import { Presentation, Download, Printer } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { loadReport, periodOptions } from "@/lib/report-data";
import { REPORT_KINDS, type ReportKind } from "@/lib/report";
import { PageHeader, Empty } from "@/components/ui";
import { SlideView } from "@/components/SlideView";
import { ReportNotes } from "@/components/ReportNotes";
import clsx from "clsx";

export default async function Reports({ searchParams }: { searchParams: Promise<{ kind?: string; ref?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const kind = (["week", "sprint", "month"].includes(sp.kind ?? "") ? sp.kind : "week") as ReportKind;
  const [report, options] = await Promise.all([loadReport(kind, sp.ref), periodOptions()]);
  const q = (k: ReportKind, ref?: string) => `kind=${k}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`;
  const here = q(kind, sp.ref);
  const meta = REPORT_KINDS.find((k) => k.kind === kind)!;
  const current = report?.facts.period.key.split(":").slice(1).join(":");

  return (
    <div className="space-y-6">
      <PageHeader title="Reports and presentations" sub="Live slides for the weekly summary, sprint demo and monthly review, with the plan for what comes next."
        actions={report ? <>
          <Link href={`/present?${here}`} className="btn-primary"><Presentation size={14} /> Present</Link>
          <a href={`/api/reports/export?${here}&format=pptx`} className="btn"><Download size={14} /> PowerPoint</a>
          <a href={`/api/reports/export?${here}&format=pdf`} className="btn"><Download size={14} /> PDF</a>
          <Link href={`/report-print?${here}`} className="btn"><Printer size={14} /> Print view</Link></> : undefined} />
      <Link href="/reports/patterns" className="card-pad block transition hover:border-neon/40"><div className="font-medium">Code review patterns</div><p className="text-sm text-mute">What Claude's reviews keep flagging, whether it is improving, and what to focus on. {atLeast(me.access, "LEAD") ? "Team rollup and each developer." : "Your own report."}</p></Link>

      <div className="card-pad space-y-4">
        <div role="tablist" aria-label="Report period" className="flex flex-wrap gap-2">
          {REPORT_KINDS.map((k) => (
            <Link key={k.kind} role="tab" aria-selected={k.kind === kind} href={`/reports?kind=${k.kind}`}
              className={clsx("rounded-lg border px-3 py-1.5 text-sm", k.kind === kind ? "border-neon/60 bg-neon/10 text-ink" : "border-line text-mute hover:text-ink")}>{k.label}</Link>))}
        </div>
        <p className="text-xs text-mute">{meta.hint}</p>
        {options[kind].length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Choose another period">
            {options[kind].map((o) => (
              <Link key={o.ref} href={`/reports?${q(kind, o.ref)}`} className={clsx("rounded-md border px-2.5 py-1 text-xs", o.ref === current || (!sp.ref && o.ref === options[kind][0]?.ref && kind !== "sprint") ? "border-neon/60 bg-neon/10 text-ink" : "border-line text-mute hover:text-ink")}>{o.label}</Link>))}
          </div>)}
      </div>

      {!report ? <Empty>There is no sprint to report on yet. Start and close a sprint in the Sprints planner, or pick the weekly or monthly report.</Empty> : (<>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {report.slides.map((s, i) => (
            <Link key={s.id} href={`/present?${here}#${i}`} className="group block" aria-label={`Open slide ${i + 1}: ${s.title}`}>
              <div className="pointer-events-none transition group-hover:-translate-y-0.5"><SlideView slide={s} index={i} total={report.slides.length} /></div>
            </Link>))}
        </div>
        <ReportNotes key={report.facts.period.key} periodKey={report.facts.period.key} canEdit={atLeast(me.access, "LEAD")} slides={report.slides.map((s) => ({ id: s.id, title: s.title, note: s.note ?? "" }))} />
      </>)}
    </div>
  );
}
