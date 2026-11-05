"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, Loader2 } from "lucide-react";
import { generateProfileAction } from "@/app/(app)/actions";
import type { DevProfile } from "@/lib/insights";
import type { ProfileStats } from "@/lib/insights-calc";

const SIGNAL = { slower: "text-neon-amber", faster: "text-neon-lime", typical: "text-mute", "not enough data": "text-mute" } as const;

export function DevInsights({ devId, name, stats, profile, ready, canGenerate }: { devId: string; name: string; stats: ProfileStats; profile: DevProfile | null; ready: boolean; canGenerate: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = () => start(async () => { setErr(null); const r = await generateProfileAction(devId); if (!r.ok) setErr(r.error); router.refresh(); });
  return (
    <div className="card-pad space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="h-section flex items-center gap-2"><Sparkles size={14} className="text-neon" /> Skills and growth insights</div>
          <p className="mt-1 text-sm text-mute">Based on finished tickets and logged time across {stats.sprintsCovered} sprint(s). Needs at least {stats.minSprints} sprints of data.</p></div>
        {canGenerate && stats.eligible && ready && <button className="btn" disabled={pending} onClick={run}>{pending ? <><Loader2 size={14} className="animate-spin" /> Analysing…</> : profile ? "Refresh analysis" : "Analyse with AI"}</button>}
      </div>

      {!stats.eligible && <p className="rounded-lg border border-dashed border-line p-4 text-sm text-mute">Not enough data yet for {name.split(" ")[0]}: {stats.ticketsConsidered} finished ticket(s) with logged time across {stats.sprintsCovered} sprint(s). Insights appear once there are finished tickets from at least {stats.minSprints} sprints.</p>}
      {stats.eligible && !ready && <p className="text-sm text-mute">Add an AI key (Claude, Gemini or OpenAI) in <Link href="/settings" className="text-neon">Settings</Link> to generate the written analysis. The numbers below are always available.</p>}
      {stats.eligible && !canGenerate && !profile && <p className="text-sm text-mute">Only leads and admins can generate analyses for other developers.</p>}
      {err && <p className="text-sm text-neon-red">{err}</p>}

      {profile && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">{profile.summary}</p>
          <div className="grid gap-4 md:grid-cols-3">
            <Block title="Strengths" tone="text-neon-lime" items={profile.strengths.map((s) => [s.topic, s.evidence])} empty="No clear strengths yet." />
            <Block title="Interests" tone="text-neon" items={profile.interests.map((s) => [s.topic, s.evidence])} empty="No clear pattern yet." />
            <Block title="Where support could help" tone="text-neon-amber" items={profile.gaps.map((g) => [g.topic, `${g.evidence} ${g.suggestion}`])} empty="No gaps stood out." />
          </div>
          <p className="text-xs text-mute">AI analysis ({profile.confidence} confidence), generated {new Date(profile.generatedAt).toLocaleDateString()}. It reflects ticket data only and may be explained by ticket complexity. Use it to start a conversation, not to judge.</p>
        </div>
      )}

      {stats.topics.length > 0 && (
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
          <thead className="text-left text-xs text-mute"><tr><th className="py-2 font-medium">Topic</th><th className="font-medium">Tickets</th><th className="font-medium">Hours / point</th><th className="font-medium">Team</th><th className="font-medium">vs team</th><th className="font-medium">Accuracy</th></tr></thead>
          <tbody className="divide-y divide-line">{stats.topics.map((t) => (
            <tr key={t.topic}><td className="py-2">{t.label}</td><td>{t.tickets}</td><td>{t.hrsPerPoint ?? "—"}</td><td>{t.teamHrsPerPoint ?? "—"}</td>
              <td className={SIGNAL[t.signal]}>{t.relativeSpeed != null ? `${t.relativeSpeed}× · ${t.signal}` : t.signal}</td><td>{t.accuracy != null ? `${Math.round(t.accuracy * 100)}%` : "—"}</td></tr>))}</tbody>
        </table></div>
      )}
    </div>
  );
}

function Block({ title, tone, items, empty }: { title: string; tone: string; items: string[][]; empty: string }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className={`mb-2 text-sm font-semibold ${tone}`}>{title}</div>
      {items.length ? <ul className="space-y-2 text-sm">{items.map(([t, e], i) => <li key={i}><div className="font-medium">{t}</div><div className="text-mute">{e}</div></li>)}</ul> : <p className="text-sm text-mute">{empty}</p>}
    </div>
  );
}
