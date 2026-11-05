"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { removeAvatarAction, uploadAvatarAction } from "@/app/(app)/actions";
import { Avatar } from "./ui";

const SIZE = 256;

/** Centre-crop to a square and shrink in the browser, so uploads are small (about 20 to 40 KB) whatever the original photo. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas"); c.width = c.height = SIZE;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not read that photo."))), "image/jpeg", 0.85));
}

export function ProfilePhoto({ id, name, hue, ver }: { id: string; name: string; hue: number; ver: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setMsg({ t: "Choose an image file.", bad: true }); return; }
    start(async () => {
      try {
        const blob = await toSquareJpeg(f);
        const fd = new FormData(); fd.set("photo", blob, "photo.jpg");
        const r = await uploadAvatarAction(fd);
        setMsg(r.ok ? { t: "Photo updated" } : { t: r.error, bad: true });
        router.refresh();
      } catch { setMsg({ t: "Could not read that photo. Try a JPG or PNG.", bad: true }); }
    });
  };
  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => input.current?.click()} disabled={pending} aria-label="Change profile photo" className="group relative rounded-full">
        <Avatar name={name} hue={hue} id={id} ver={ver} size={72} />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><Camera size={20} /></span>
      </button>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={pending} onClick={() => input.current?.click()}><Camera size={14} /> {ver > 0 ? "Change photo" : "Upload photo"}</button>
          {ver > 0 && <button className="btn-ghost" disabled={pending} onClick={() => start(async () => { const r = await removeAvatarAction(); setMsg(r.ok ? { t: "Photo removed" } : { t: r.error, bad: true }); router.refresh(); })}><Trash2 size={14} /> Remove</button>}
        </div>
        <p className="text-xs text-mute">JPG, PNG or WebP. It is cropped to a square. Everyone in the workspace can see it.</p>
        {msg && <p role="status" className={`text-xs ${msg.bad ? "text-neon-red" : "text-neon-lime"}`}>{msg.t}</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
