"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { href: "/admin/users", label: "Users & roles" },
  { href: "/admin/meetings", label: "Meetings" },
  { href: "/admin/review", label: "PR review" },
  { href: "/admin/holidays", label: "Holidays" },
  { href: "/admin/workspace", label: "Workspace" },
];

export function AdminTabs() {
  const path = usePathname();
  return (
    <div className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Admin sections">
      <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} role="tab" aria-selected={path.startsWith(t.href)}
            className={clsx("whitespace-nowrap rounded-lg px-3.5 py-2 text-sm", path.startsWith(t.href) ? "bg-line text-ink" : "text-mute hover:text-ink")}>{t.label}</Link>))}
      </div>
    </div>
  );
}
