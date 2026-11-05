import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { loadReport } from "@/lib/report-data";
import { Presenter } from "@/components/Presenter";
import type { ReportKind } from "@/lib/report";
import { loadOneOnOne } from "@/lib/one-on-one-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Presenting" };

export default async function Present({ searchParams }: { searchParams: Promise<{ kind?: string; ref?: string; dev?: string; m?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  if (sp.kind === "oneonone") {
    const d = await loadOneOnOne(me, sp.dev, sp.m);
    if (!d || !d.slides.length) notFound();
    return <Presenter slides={d.slides} exit={`/reports?kind=oneonone${sp.dev ? `&dev=${sp.dev}` : ""}${sp.m ? `&m=${sp.m}` : ""}`} />;
  }
  const kind = (["week", "sprint", "month"].includes(sp.kind ?? "") ? sp.kind : "week") as ReportKind;
  const report = await loadReport(kind, sp.ref, new Date(), { includePeople: atLeast(me.access, "LEAD") });
  if (!report) notFound();
  return <Presenter slides={report.slides} exit={`/reports?kind=${kind}${sp.ref ? `&ref=${encodeURIComponent(sp.ref)}` : ""}`} />;
}
