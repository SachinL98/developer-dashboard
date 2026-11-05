import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { TicketForm } from "@/components/TicketForm";
import { jiraReady } from "@/lib/integrations/jira";

export default async function NewTicket() {
  const [projects, devs, sprints] = await Promise.all([
    db.project.findMany({ orderBy: { name: "asc" } }), db.developer.findMany({ orderBy: { name: "asc" } }), db.sprint.findMany({ where: { state: { not: "CLOSED" } }, orderBy: { startDate: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader back={{ href: "/board", label: "Board" }} title="New ticket" sub="Add one ticket, or paste several to add them in bulk." />
      <TicketForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} devs={devs.map((d) => ({ id: d.id, name: d.name }))} sprints={sprints.map((s) => ({ id: s.id, name: s.name }))} jira={await jiraReady()} />
    </div>
  );
}
