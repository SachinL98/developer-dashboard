import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { loadReport } from "@/lib/report-data";
import { SlideView } from "@/components/SlideView";
import { PrintBar } from "@/components/PrintBar";
import type { ReportKind } from "@/lib/report";
import { loadOneOnOne } from "@/lib/one-on-one-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Report" };

/** Printable report: one slide per landscape page, always in the light theme so it prints cleanly. Use the browser's Save as PDF. */
export default async function PrintReport({ searchParams }: { searchParams: Promise<{ kind?: string; ref?: string; dev?: string; m?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const one = sp.kind === "oneonone" ? await loadOneOnOne(me, sp.dev, sp.m) : null;
  if (sp.kind === "oneonone" && (!one || !one.slides.length)) notFound();
  const kind = (["week", "sprint", "month"].includes(sp.kind ?? "") ? sp.kind : "week") as ReportKind;
  const report = one ? { slides: one.slides } : await loadReport(kind, sp.ref, new Date(), { includePeople: atLeast(me.access, "LEAD") });
  if (!report) notFound();
  return (
    <div className="force-light min-h-screen bg-bg text-ink">
      <style>{`@page { size: A4 landscape; margin: 8mm } @media print { .no-print { display: none !important } .slide-page { break-after: page; page-break-after: always } .slide-page:last-child { break-after: auto } body { background: #fff !important } }`}</style>
      <PrintBar back={one ? `/reports?kind=oneonone${sp.dev ? `&dev=${sp.dev}` : ""}${sp.m ? `&m=${sp.m}` : ""}` : `/reports?kind=${kind}${sp.ref ? `&ref=${encodeURIComponent(sp.ref)}` : ""}`} />
      <div className="mx-auto max-w-5xl space-y-6 px-4 pb-10 print:max-w-none print:space-y-0 print:p-0">
        {report.slides.map((s, i) => <div key={s.id} className="slide-page"><SlideView slide={s} index={i} total={report.slides.length} className="print:rounded-none print:border-0" /></div>)}
      </div>
    </div>
  );
}
