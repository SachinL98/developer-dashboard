import Link from "next/link";
import { PageHeader, Avatar, Progress } from "@/components/ui";
import { developerStats } from "@/lib/queries";
import { requireUser } from "@/lib/auth/session";
import { canViewDeveloper } from "@/lib/permissions";

export default async function Team() {
  const me = await requireUser();
  // Developers see only themselves; leads and admins see everyone.
  const stats = (await developerStats()).filter((s) => canViewDeveloper(me, s.d.id));
  return (
    <div>
      <PageHeader title="People" sub={me.access === "DEVELOPER" ? "Your workload and delivery." : "Workload and delivery for each developer."} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((s) => (
          <Link key={s.d.id} href={`/team/${s.d.id}`} className="card-pad block transition hover:border-neon/40">
            <div className="flex items-center gap-3"><Avatar name={s.d.name} hue={s.d.avatarHue} size={42} /><div><div className="font-medium">{s.d.name}</div><div className="text-xs text-mute">{s.d.role}</div></div></div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div><div className="font-semibold tabular-nums text-xl">{s.donePoints}</div><div className="text-[10px] text-mute">pts done</div></div>
              <div><div className="font-semibold tabular-nums text-xl">{s.active.length}</div><div className="text-[10px] text-mute">in flight</div></div>
              <div><div className="font-semibold tabular-nums text-xl">{s.worked.toFixed(0)}h</div><div className="text-[10px] text-mute">14 days</div></div>
            </div>
            <div className="mt-4"><div className="mb-1 flex justify-between text-[11px] text-mute"><span>Time tracked on cards</span><span>{s.worked ? Math.round((s.tracked / s.worked) * 100) : 0}%</span></div><Progress pct={s.worked ? (s.tracked / s.worked) * 100 : 0} /></div>
          </Link>
        ))}
      </div>
    </div>
  );
}
