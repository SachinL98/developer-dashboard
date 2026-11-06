import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { loadReport } from "@/lib/report-data";
import { reportFileName, toPdf, toPptx } from "@/lib/report-export";
import type { ReportKind } from "@/lib/report";
import { loadOneOnOne } from "@/lib/one-on-one-data";
import { loadQuality, latestQualityInsight } from "@/lib/quality";
import { qualitySlides } from "@/lib/quality-slides";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/reports/export?kind=week|sprint|month|oneonone|quality&ref=...&format=pdf|pptx. Signed-in users only. 1:1 and quality reports follow the same privacy rules as their pages. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind") as ReportKind;
  const format = q.get("format");
  if ((q.get("kind") === "oneonone" || q.get("kind") === "quality") && ["pdf", "pptx"].includes(format ?? "")) {
    let slides, title: string;
    if (q.get("kind") === "oneonone") {
      const d = await loadOneOnOne(user, q.get("dev") || undefined, q.get("m") || undefined);
      if (!d || !d.slides.length) return NextResponse.json({ error: "No 1:1 report to export" }, { status: d ? 404 : 403 });
      slides = d.slides; title = d.slides[0].title;
    } else {
      const [{ links, stats }, insight, devs] = await Promise.all([loadQuality(), latestQualityInsight(), db.developer.findMany({ select: { id: true, name: true } })]);
      slides = qualitySlides(stats, links, new Map(devs.map((x) => [x.id, x.name])), insight, { all: atLeast(user.access, "LEAD"), viewerId: user.id }); title = "Quality insights";
    }
    const out = format === "pdf" ? await toPdf(slides, title) : await toPptx(slides, title);
    return new NextResponse(new Uint8Array(out), { headers: { "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation", "Content-Disposition": `attachment; filename="${reportFileName(title, format!)}"`, "Cache-Control": "no-store, private" } });
  }
  if (!["week", "sprint", "month"].includes(kind) || !["pdf", "pptx"].includes(format ?? "")) return NextResponse.json({ error: "kind must be week, sprint or month and format pdf or pptx" }, { status: 400 });
  const report = await loadReport(kind, q.get("ref") || undefined, new Date(), { includePeople: atLeast(user.access, "LEAD") });
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
