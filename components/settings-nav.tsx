"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/settings", label: "General" },
  { href: "/settings/providers", label: "AI Providers" },
  { href: "/settings/usage", label: "Usage" },
  { href: "/settings/connectors", label: "Connectors" },
  { href: "/settings/modules", label: "Modules" },
  { href: "/settings/members", label: "Members" },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-navy-800/10">
      {tabs.map((tab) => {
        const active =
          tab.href === "/settings"
            ? pathname === "/settings"
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={[
              "whitespace-nowrap px-4 py-2.5 text-[15px] font-medium transition",
              active
                ? "border-b-2 border-mint-700 text-mint-700"
                : "text-navy-800/50 hover:text-navy-900",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
