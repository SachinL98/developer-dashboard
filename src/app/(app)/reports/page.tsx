import Link from "next/link";
import { Presentation, Download, Printer } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { loadReport, periodOptions } from "@/lib/report-data";
import { REPORT_KINDS, type ReportKind } from "@/lib/report";
import { db } from "@/lib/db";
import { aiKeyFor } from "@/lib/ai";
import { loadOneOnOne } from "@/lib/one-on-one-data";
import { OneOnOneActions } from "@/components/OneOnOneActions";
import { OneOnOneDetail } from "@/components/OneOnOneDetail";
import { PageHeader, Empty } from "@/components/ui";
import { SlideView } from "@/components/SlideView";
import { ReportNotes } from "@/components/ReportNotes";
import clsx from "clsx";

export default async function Reports({ searchParams }: { searchParams: Promise<{ kind?: string; ref?: string; dev?: string; m?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  if (sp.kind === "oneonone") return <OneOnOneTab me={me} dev={sp.dev} month={sp.m} />;
  const kind = (["week", "sprint", "month"].includes(sp.kind ?? "") ? sp.kind : "week") as ReportKind;
  const [report, options] = await Promise.all([loadReport(kind, sp.ref, new Date(), { includePeople: atLeast(me.access, "LEAD") }), periodOptions()]);
  const q = (k: ReportKind, ref?: string) => `kind=${k}${ref ? `&ref=${encodeURIComponent(ref)}` : ""}`;
  const here = q(kind, sp.ref);
  const meta = REPORT_KINDS.find((k) => k.kind === kind)!;
  const current = report?.facts.period.key.split(":").slice(1).join(":");

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" sub="Weekly, sprint and monthly summaries, ready to present."
        actions={report ? <>
          <Link href={`/present?${here}`} className="btn-primary"><Presentation size={14} /> Present</Link>
          <a href={`/api/reports/export?${here}&format=pptx`} className="btn"><Download size={14} /> PowerPoint</a>
          <a href={`/api/reports/export?${here}&format=pdf`} className="btn"><Download size={14} /> PDF</a>
          <Link href={`/report-print?${here}`} className="btn"><Printer size={14} /> Print view</Link></> : undefined} />
      <Link href="/reports/patterns" className="card-pad block transition hover:border-neon/40"><div className="font-medium">Code review patterns</div><p className="text-sm text-mute">What Claude's reviews keep flagging, whether it is improving, and what to focus on. {atLeast(me.access, "LEAD") ? "Team rollup and each developer." : "Your own report."}</p></Link>

      <div className="card-pad space-y-4">
        <div role="tablist" aria-label="Report period" className="flex flex-wrap gap-2">
          <KindTabs active={kind} />
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

function KindTabs({ active }: { active: ReportKind | "oneonone" }) {
  return (
    <>
      {[...REPORT_KINDS.map((k) => ({ kind: k.kind as string, label: k.label })), { kind: "oneonone", label: "1:1 report" }].map((k) => (
        <Link key={k.kind} role="tab" aria-selected={k.kind === active} href={`/reports?kind=${k.kind}`}
          className={clsx("rounded-lg border px-3 py-1.5 text-sm", k.kind === active ? "border-neon/60 bg-neon/10 text-ink" : "border-line text-mute hover:text-ink")}>{k.label}</Link>))}
    </>
  );
}

const monthName = (k: string) => new Date(`${k}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** Monthly 1:1 report as a slideshow plus the full written report. Visible to the person, leads and admins only. */
async function OneOnOneTab({ me, dev, month }: { me: Awaited<ReturnType<typeof requireUser>>; dev?: string; month?: string }) {
  const data = await loadOneOnOne(me, dev, month);
  if (!data) return <Empty>You can only see your own 1:1 report.</Empty>;
  const { devId, person, own, reports, report, slides } = data;
  const ai = await aiKeyFor(me.id);
  const people = atLeast(me.access, "LEAD") ? await db.developer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  const here = `kind=oneonone${own ? "" : `&dev=${devId}`}${report ? `&m=${report.monthKey}` : ""}`;
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" sub={own ? "Your monthly 1:1: the last two weeks compared with the 30 days before, with suggestions to take into the conversation." : `Monthly 1:1 report for ${person.name}.`}
        actions={report ? <>
          <Link href={`/present?${here}`} className="btn-primary"><Presentation size={14} /> Present</Link>
          <a href={`/api/reports/export?${here}&format=pptx`} className="btn"><Download size={14} /> PowerPoint</a>
          <a href={`/api/reports/export?${here}&format=pdf`} className="btn"><Download size={14} /> PDF</a>
          <Link href={`/report-print?${here}`} className="btn"><Printer size={14} /> Print view</Link></> : undefined} />
      <div className="card-pad space-y-4">
        <div role="tablist" aria-label="Report type" className="flex flex-wrap gap-2"><KindTabs active="oneonone" /></div>
        {people.length > 1 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Choose a person">
            {people.map((p) => <Link key={p.id} href={`/reports?kind=oneonone${p.id === me.id ? "" : `&dev=${p.id}`}`} className={clsx("rounded-md border px-2.5 py-1 text-xs", p.id === devId ? "border-neon/60 bg-neon/10 text-ink" : "border-line text-mute hover:text-ink")}>{p.id === me.id ? "Me" : p.name}</Link>)}
          </div>)}
        {reports.length > 1 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Choose a month">
            {reports.map((x) => <Link key={x.id} href={`/reports?kind=oneonone${own ? "" : `&dev=${devId}`}&m=${x.report.monthKey}`} className={clsx("rounded-md border px-2.5 py-1 text-xs", x.report.monthKey === report?.monthKey ? "border-neon/60 bg-neon/10 text-ink" : "border-line text-mute hover:text-ink")}>{monthName(x.report.monthKey)}</Link>)}
          </div>)}
        <OneOnOneActions devId={devId} hasReport={!!report} aiReady={!!ai} />
      </div>
      {slides.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {slides.map((s, i) => (
            <Link key={s.id} href={`/present?${here}#${i}`} className="group block" aria-label={`Open slide ${i + 1}: ${s.title}`}>
              <div className="pointer-events-none transition group-hover:-translate-y-0.5"><SlideView slide={s} index={i} total={slides.length} /></div>
            </Link>))}
        </div>)}
      <OneOnOneDetail r={report} own={own} />
    </div>
  );
}
