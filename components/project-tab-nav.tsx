"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectTabNav({ basePath }: { basePath: string }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith(`${basePath}/admin`);
  const isAgents = pathname.startsWith(`${basePath}/agents`);

  const tabs = [
    {
      href: `${basePath}/workflows`,
      label: "Workflows",
      active: !isAdmin && !isAgents,
    },
    { href: `${basePath}/agents`, label: "Agents", active: isAgents },
    { href: `${basePath}/admin`, label: "Admin", active: isAdmin },
  ];

  return (
    <nav className="mb-8 flex gap-1 border-b border-navy-800/10">
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
