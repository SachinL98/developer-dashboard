import { redirect } from "next/navigation";

/** The 1:1 report now lives inside Reports. Old links and bookmarks land there. */
export default async function OneOnOne({ searchParams }: { searchParams: Promise<{ dev?: string; m?: string }> }) {
  const sp = await searchParams;
  const q = new URLSearchParams({ kind: "oneonone", ...(sp.dev ? { dev: sp.dev } : {}), ...(sp.m ? { m: sp.m } : {}) });
  redirect(`/reports?${q}`);
}
