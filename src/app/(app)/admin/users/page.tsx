import { requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { atLeast, allowedDomain } from "@/lib/permissions";
import { PageHeader, Avatar } from "@/components/ui";
import { UserRow } from "@/components/UserRow";
import { fmtDay, fmtTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Users() {
  const me = await requireUser();
  if (!atLeast(me.access, "ADMIN")) redirect("/");
  const users = await db.developer.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { connections: { select: { provider: true } } } });
  return (
    <div className="space-y-6">
      <PageHeader title="Users & roles" sub={`Anyone with an @${allowedDomain()} Google account can sign in as a developer. Promote leads and admins here.`} />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-panel2 text-left text-xs uppercase tracking-wider text-mute"><tr><th className="p-3">User</th><th>Access</th><th>Jira</th><th>Google</th><th>Last sign-in</th><th className="pr-3 text-right">Status</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} self={u.id === me.id} user={{ id: u.id, name: u.name, email: u.email, access: u.access, active: u.active, hue: u.avatarHue }}
                jira={u.connections.some((c) => c.provider === "JIRA")} google={u.connections.some((c) => c.provider === "GOOGLE")}
                last={u.lastLoginAt ? `${fmtDay(u.lastLoginAt)} ${fmtTime(u.lastLoginAt)}` : "never"} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-mute">Developers move their own cards up to Review and log time, progress and estimates. Leads also plan sprints, assign tickets, move cards through staging and production, and sync integrations. Admins manage users.</p>
    </div>
  );
}
void Avatar;
