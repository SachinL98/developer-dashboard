import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { loadReport } from "@/lib/report-data";
import { reportFileName, toPdf, toPptx } from "@/lib/report-export";
import type { ReportKind } from "@/lib/report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/reports/export?kind=week|sprint|month&ref=...&format=pdf|pptx. Signed-in users only. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind") as ReportKind;
  const format = q.get("format");
  if (!["week", "sprint", "month"].includes(kind) || !["pdf", "pptx"].includes(format ?? "")) return NextResponse.json({ error: "kind must be week, sprint or month and format pdf or pptx" }, { status: 400 });
  const report = await loadReport(kind, q.get("ref") || undefined);
  if (!report) return NextResponse.json({ error: "No data for that period yet (no sprint found)" }, { status: 404 });
  const title = `${report.slides[0].title}`;
  const buf = format === "pdf" ? await toPdf(report.slides, title) : await toPptx(report.slides, title);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${reportFileName(title, format!)}"`, "Cache-Control": "no-store",
    },
  });
}
