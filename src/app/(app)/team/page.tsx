import Link from "next/link";
import { PageHeader, Avatar, Progress } from "@/components/ui";
import { developerStats } from "@/lib/queries";

export default async function Team() {
  const stats = await developerStats();
  return (
    <div>
      <PageHeader title="Team" sub="Load, throughput and focus per developer." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.d.id} href={`/team/${s.d.id}`} className="card-pad block transition hover:border-neon/40">
            <div className="flex items-center gap-3"><Avatar name={s.d.name} hue={s.d.avatarHue} size={42} /><div><div className="font-medium">{s.d.name}</div><div className="text-xs text-mute">{s.d.role}</div></div></div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div><div className="font-mono text-xl">{s.donePoints}</div><div className="text-[10px] uppercase text-mute">pts done</div></div>
              <div><div className="font-mono text-xl">{s.active.length}</div><div className="text-[10px] uppercase text-mute">in flight</div></div>
              <div><div className="font-mono text-xl">{s.worked.toFixed(0)}h</div><div className="text-[10px] uppercase text-mute">14 days</div></div>
            </div>
            <div className="mt-4"><div className="mb-1 flex justify-between text-[11px] text-mute"><span>Time tracked on cards</span><span>{s.worked ? Math.round((s.tracked / s.worked) * 100) : 0}%</span></div><Progress pct={s.worked ? (s.tracked / s.worked) * 100 : 0} /></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
