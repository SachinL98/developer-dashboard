import { PageHeader } from "@/components/ui";

/** Shown instead of the local leave and holiday screens once the HR app is the source of truth. */
export function HrManaged({ title, what, path }: { title: string; what: string; path: string }) {
  const base = process.env.HR_WEB_URL?.replace(/\/$/, "");
  return (
    <div className="space-y-6">
      <PageHeader title={title} sub={`${what} are managed in Seamless Source HR. Approved leave and public holidays still feed sprint capacity here automatically.`} />
      <div className="card-pad">
        {base ? (
          <a className="btn" href={`${base}${path}`} target="_blank" rel="noreferrer">Open in Seamless Source HR</a>
        ) : (
          <p className="text-sm text-mute">Ask an admin to set HR_WEB_URL so this page can link to the HR app.</p>
        )}
      </div>
    </div>
  );
}
