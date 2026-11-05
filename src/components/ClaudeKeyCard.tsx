"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed } from "lucide-react";
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
        <div className="flex items-center gap-2 font-medium">{connected ? <CheckCircle2 size={18} className="text-neon-lime" /> : <CircleDashed size={18} className="text-mute" />}Claude AI</div>
        {connected && <button className="btn" disabled={pending} onClick={remove}>Remove key</button>}
      </div>
      <p className="mt-2 text-sm text-mute">
        {connected ? "Connected. Meeting summaries, developer insights and estimate reviews run on your own Anthropic account."
          : serverFallback ? "Add your own Anthropic API key to run AI features on your account. Until then the team's shared key is used."
          : "Add your Anthropic API key to turn on meeting summaries, developer insights and estimate reviews."}
      </p>
      {!connected && (
        <div className="mt-3 flex flex-wrap gap-2">
          <input type="password" autoComplete="off" className="input min-w-[240px] flex-1" placeholder="Anthropic API key (sk-ant-…)" value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn-primary" disabled={pending || key.trim().length < 20} onClick={save}>Save</button>
        </div>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.bad ? "text-neon-red" : "text-neon-lime"}`}>{msg.t}</p>}
      <p className="mt-3 text-xs text-mute">Get a key at console.anthropic.com. Data is sent to Anthropic only when you press an AI button.</p>
    </div>
  );
}
