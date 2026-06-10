"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function KnowledgeTabNav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/knowledge", label: "Knowledge base", active: pathname === "/knowledge" },
    {
      href: "/knowledge/files",
      label: "Workspace files",
      active: pathname.startsWith("/knowledge/files"),
    },
  ];

  return (
    <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-navy-800/10">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={[
            "whitespace-nowrap px-4 py-2.5 text-[15px] font-medium transition",
            tab.active
              ? "border-b-2 border-mint-700 text-mint-700"
              : "text-navy-800/50 hover:text-navy-900",
          ].join(" ")}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
