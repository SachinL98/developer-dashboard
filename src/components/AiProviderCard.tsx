"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleDashed } from "lucide-react";
import clsx from "clsx";
import { removeAiKeyAction, saveAiKeyAction, setAiProviderAction } from "@/app/(app)/actions";
import { PROVIDERS, type AiProvider } from "@/lib/ai-providers";

export function AiProviderCard({ saved, preferred, serverProviders }: { saved: { provider: AiProvider; model: string }[]; preferred: AiProvider | null; serverProviders: AiProvider[] }) {
  const [provider, setProvider] = useState<AiProvider>(preferred ?? "anthropic");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const meta = PROVIDERS.find((p) => p.id === provider)!;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); setMsg(r.ok ? { t: ok } : { t: r.error ?? "Failed", bad: true }); if (r.ok) { setKey(""); setModel(""); } router.refresh(); });
  const connected = saved.length > 0;
  return (
    <div className="card-pad space-y-4">
      <div className="flex items-center gap-2 font-medium">{connected ? <CheckCircle2 size={18} className="text-neon-lime" /> : <CircleDashed size={18} className="text-mute" />}AI assistant</div>
      <p className="text-sm text-mute">
        Meeting notes, developer insights, estimate reviews and pull request reviews can run on Claude, Google Gemini or OpenAI, using your own key so usage is billed to your account.
        {!connected && (serverProviders.length ? " Until you add one, the team's shared key is used." : " Add a key to turn these features on.")}
      </p>

      {connected && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {saved.map((s) => {
            const m = PROVIDERS.find((p) => p.id === s.provider)!;
            const active = s.provider === preferred;
            return (
              <li key={s.provider} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1"><span className="font-medium">{m.label}</span><span className="ml-2 text-xs text-mute">{s.model || m.defaultModel}</span></span>
                {active ? <span className="chip border-neon/40 text-neon">In use</span> : <button className="btn px-2 py-1 text-xs" disabled={pending} onClick={() => run(() => setAiProviderAction(s.provider), `${m.label} is now in use.`)}>Use this one</button>}
                <button className="btn-ghost px-2 py-1 text-xs" disabled={pending} onClick={() => run(() => removeAiKeyAction(s.provider), `${m.label} key removed.`)}>Remove</button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3">
        <div className="text-sm font-medium">{connected ? "Add or replace a key" : "Connect a provider"}</div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="AI provider">
          {PROVIDERS.map((p) => (
            <button key={p.id} role="radio" aria-checked={provider === p.id} className={clsx("rounded-lg border px-3 py-1.5 text-sm transition", provider === p.id ? "border-neon bg-neon/10 text-neon" : "border-line text-mute hover:bg-panel2 hover:text-ink")} onClick={() => setProvider(p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_200px_auto]">
          <input type="password" autoComplete="off" className="input" placeholder={`${meta.label} API key (${meta.keyHint})`} value={key} onChange={(e) => setKey(e.target.value)} aria-label={`${meta.label} API key`} />
          <input className="input" placeholder={`Model (${meta.defaultModel})`} value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model name, optional" />
          <button className="btn-primary" disabled={pending || key.trim().length < 20} onClick={() => run(() => saveAiKeyAction({ provider, key, model }), `${meta.label} connected.`)}>Save</button>
        </div>
        <p className="text-xs text-mute">Get a key at {meta.keyUrl}. Leave the model empty for the default. Data is sent to the provider only when you press an AI button.</p>
      </div>
      {msg && <p className={`text-xs ${msg.bad ? "text-neon-red" : "text-neon-lime"}`}>{msg.t}</p>}
    </div>
  );
}
