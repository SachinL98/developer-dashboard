import Link from "next/link";
import { Search } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Empty } from "@/components/ui";
import { fmtDay } from "@/lib/time";

export const dynamic = "force-dynamic";

const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default async function Decisions({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const meetings = await db.meeting.findMany({ where: { decisions: { isEmpty: false } }, orderBy: { startsAt: "desc" }, take: 300, select: { id: true, title: true, startsAt: true, decisions: true } });
  const needle = q.toLowerCase();
  const rows = meetings
    .map((m) => ({ ...m, decisions: needle ? m.decisions.filter((d) => d.toLowerCase().includes(needle) || m.title.toLowerCase().includes(needle)) : m.decisions }))
    .filter((m) => m.decisions.length);
  const groups = new Map<string, typeof rows>();
  rows.forEach((m) => groups.set(month(m.startsAt), [...(groups.get(month(m.startsAt)) ?? []), m]));
  const total = rows.reduce((n, m) => n + m.decisions.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Decisions" sub="Everything the team decided in meetings, in one searchable place." />
      <form role="search" className="flex max-w-xl gap-2">
        <div className="relative flex-1"><Search size={15} className="pointer-events-none absolute left-3 top-3 text-mute" /><input name="q" defaultValue={q} placeholder="Search decisions, e.g. pricing, release, estimates" aria-label="Search decisions" className="input pl-9" /></div>
        <button className="btn">Search</button>
        {q && <Link href="/decisions" className="btn-ghost">Clear</Link>}
      </form>
      {!rows.length ? <Empty>{q ? <>Nothing matches “{q}”.</> : "No decisions recorded yet. They appear here after the notes of a meeting are written."}</Empty> : (<>
        <p className="text-xs text-mute">{total} decision{total === 1 ? "" : "s"}{q ? ` matching “${q}”` : ""} from {rows.length} meeting{rows.length === 1 ? "" : "s"}.</p>
        {[...groups].map(([label, ms]) => (
          <section key={label} className="card-pad">
            <h2 className="mb-3 text-sm font-semibold">{label}</h2>
            <ul className="space-y-4">
              {ms.map((m) => (
                <li key={m.id}>
                  <Link href={`/meetings#${m.id}`} className="text-xs font-medium text-neon hover:underline">{m.title} · {fmtDay(m.startsAt)}</Link>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{m.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </li>))}
            </ul>
          </section>))}
      </>)}
    </div>
  );
}
