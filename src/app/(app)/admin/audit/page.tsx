import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { fmtDay, fmtTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  setAccess: "Changed a role", setActive: "Turned an account on or off", createUser: "Created a user", resetPassword: "Reset a password", approveSignup: "Approved a sign-up", rejectSignup: "Rejected a sign-up",
  saveWorkspace: "Changed workspace settings", saveProject: "Edited a project", createProject: "Created a project", saveReviewConfig: "Changed PR review settings", saveMeetings: "Changed meeting settings",
  setMeetingLink: "Set a meeting link", saveHolidays: "Changed holidays", saveNotifyConfig: "Changed alert settings", mergePerson: "Merged two people", setPersonEmail: "Set a person's email", saveStatusMap: "Changed the Jira status map", disconnect: "Disconnected an integration",
};

export default async function AdminAudit() {
  const rows = await db.auditLog.findMany({ orderBy: { at: "desc" }, take: 100 });
  const ids = [...new Set(rows.map((r) => r.target).filter((t): t is string => !!t))];
  const people = ids.length ? await db.developer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const name = new Map(people.map((p) => [p.id, p.name]));
  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" sub="Who changed what in the admin area. The latest 100 entries." />
      <div className="card overflow-x-auto">
        <table className="tbl min-w-[560px]">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>About</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}><td className="whitespace-nowrap text-xs text-mute">{fmtDay(r.at)} {fmtTime(r.at)}</td><td>{r.actorName}</td><td>{LABEL[r.action] ?? r.action}</td>
                <td className="text-xs text-mute">{r.target ? name.get(r.target) ?? r.target : r.detail ? JSON.stringify(r.detail).slice(0, 80) : ""}</td></tr>))}
            {!rows.length && <tr><td colSpan={4} className="py-8 text-center text-mute">Nothing recorded yet. Admin changes made from now on appear here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
