import Link from "next/link";
import { PageHeader } from "@/components/ui";

const tabs = [
  { href: "/settings", label: "General" },
  { href: "/settings/providers", label: "AI Providers" },
  { href: "/settings/usage", label: "Usage" },
  { href: "/settings/knowledge", label: "Workspace KB" },
  { href: "/settings/members", label: "Members" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title="Settings" />
      <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-navy-800/10">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="whitespace-nowrap px-4 py-2.5 text-[15px] font-medium text-navy-800/60 transition hover:text-navy-900"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}
