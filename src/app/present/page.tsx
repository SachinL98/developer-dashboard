import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { loadReport } from "@/lib/report-data";
import { Presenter } from "@/components/Presenter";
import type { ReportKind } from "@/lib/report";

export const dynamic = "force-dynamic";
export const metadata = { title: "Presenting" };

export default async function Present({ searchParams }: { searchParams: Promise<{ kind?: string; ref?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const kind = (["week", "sprint", "month"].includes(sp.kind ?? "") ? sp.kind : "week") as ReportKind;
  const report = await loadReport(kind, sp.ref);
  if (!report) notFound();
  return <Presenter slides={report.slides} exit={`/reports?kind=${kind}${sp.ref ? `&ref=${encodeURIComponent(sp.ref)}` : ""}`} />;
}
