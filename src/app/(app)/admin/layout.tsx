import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { atLeast } from "@/lib/permissions";
import { AdminTabs } from "@/components/AdminTabs";

export const dynamic = "force-dynamic";

/** Everything under /admin is admin-only. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  if (!atLeast(me.access, "ADMIN")) redirect("/");
  return <><AdminTabs />{children}</>;
}
