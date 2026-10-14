"use client";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { syncGithubAction, syncJiraAction, syncMeetingsAction } from "@/app/actions";



export function SyncButtons({ what, disabled }: { what: "jira" | "github" | "meetings"; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const label = { jira: "Sync Jira", github: "Sync GitHub", meetings: "Sync meetings" }[what];
  return (
    <div className="flex items-center gap-2">
      {msg && <span className={`max-w-[260px] truncate text-xs ${msg.bad ? "text-neon-red" : "text-neon-lime"}`} title={msg.t}>{msg.t}</span>}
      <button className="btn" disabled={disabled || pending} title={disabled ? "Not configured — see Integrations" : undefined}
        onClick={() => start(async () => {
          const r: any = what === "jira" ? await syncJiraAction() : what === "github" ? await syncGithubAction() : await syncMeetingsAction();
          setMsg(r.ok ? { t: r.summary ?? `${r.created} meeting(s) added${r.google ? " with Meet links" : ""}` } : { t: r.error, bad: true });
        })}>
        <RefreshCw size={14} className={pending ? "animate-spin" : ""} /> {label}
      </button>
    </div>
  );
}
