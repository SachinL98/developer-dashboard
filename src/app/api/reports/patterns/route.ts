import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { canViewPatterns } from "@/lib/permissions";
import { loadAnalysis } from "@/lib/patterns-data";
import { patternSlides } from "@/lib/patterns";
import { reportFileName, toPdf, toPptx } from "@/lib/report-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/reports/patterns?dev=<developer id>|team&format=pdf|pptx. Only that developer, leads and admins; never other developers. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const dev = q.get("dev") || user.id;
  const format = q.get("format");
  if (!["pdf", "pptx"].includes(format ?? "")) return NextResponse.json({ error: "format must be pdf or pptx" }, { status: 400 });
  if (!canViewPatterns(user, dev)) return NextResponse.json({ error: "You can only see your own review patterns" }, { status: 403 });
  const a = await loadAnalysis();
  let slides, title;
  if (dev === "team") { title = "Team review patterns"; slides = patternSlides(title, "team", a.team, { devs: a.devs, byProject: a.byProject }); }
  else {
    const d = a.devs.find((x) => x.developerId === dev);
    if (!d) return NextResponse.json({ error: "No Claude reviews for that developer yet" }, { status: 404 });
    title = `Review patterns: ${d.name}`; slides = patternSlides(title, "developer", d);
  }
  const buf = format === "pdf" ? await toPdf(slides, title) : await toPptx(slides, title);
  return new NextResponse(new Uint8Array(buf), { headers: {
    "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "Content-Disposition": `attachment; filename="${reportFileName(title, format!)}"`, "Cache-Control": "no-store, private",
  } });
}
