import { db } from "./db";
import { canViewDeveloper } from "./permissions";
import { latestReports, type OneOnOneReport } from "./one-on-one";
import { oneOnOneSlides } from "./one-on-one-slides";

/** Everything the Reports page, presenter and print view need for one person's 1:1 report. Returns null when the reader may not see that person. */
export async function loadOneOnOne(me: { id: string; access: string }, dev?: string, month?: string) {
  const devId = dev && dev !== me.id ? dev : me.id;
  if (!canViewDeveloper(me as Parameters<typeof canViewDeveloper>[0], devId)) return null;
  const person = await db.developer.findUnique({ where: { id: devId }, select: { id: true, name: true, avatarHue: true } });
  if (!person) return null;
  const reports = await latestReports(devId);
  const picked = (month && reports.find((x) => x.report.monthKey === month)) || reports[0];
  const report: OneOnOneReport | undefined = picked?.report;
  return { devId, person, own: devId === me.id, reports, report, slides: report ? oneOnOneSlides(report, person.name) : [] };
}
