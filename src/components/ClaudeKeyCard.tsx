"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed, Sparkles } from "lucide-react";
import { removeClaudeKeyAction, saveClaudeKeyAction } from "@/app/(app)/actions";

export function ClaudeKeyCard({ connected, serverFallback }: { connected: boolean; serverFallback: boolean }) {
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const save = () => start(async () => {
    const r = await saveClaudeKeyAction(key);
    if (r.ok) { setKey(""); setMsg({ t: "Claude connected." }); } else setMsg({ t: r.error, bad: true });
    router.refresh();
  });
  const remove = () => start(async () => { await removeClaudeKeyAction(); setMsg(null); router.refresh(); });
  return (
    <div className="card-pad">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">{connected ? <CheckCircle2 size={18} className="text-neon-lime" /> : <CircleDashed size={18} className="text-mute" />}<Sparkles size={15} className="text-neon" /> Claude (AI features)</div>
        {connected && <button className="btn" disabled={pending} onClick={remove}>Remove key</button>}
      </div>
      <p className="mt-2 text-sm text-mute">
        Meeting summaries, developer insights and estimate reviews use <b className="font-medium text-ink">your own Anthropic API key</b>, so usage is billed to your account.
        {" "}{connected ? "Your key is saved (encrypted) and in use." : serverFallback ? "Without a key, the team's shared key is used." : "Add a key to turn these features on."}
      </p>
      {!connected && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input type="password" autoComplete="off" className="input min-w-[240px] flex-1" placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn-primary" disabled={pending || key.trim().length < 20} onClick={save}>Save key</button>
        </div>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.bad ? "text-neon-red" : "text-neon-lime"}`}>{msg.t}</p>}
      <p className="mt-2 text-xs text-mute">Create a key at console.anthropic.com. Ticket text, hours and meeting transcripts are sent to Anthropic only when you press an AI button.</p>
    </div>
  );
}
