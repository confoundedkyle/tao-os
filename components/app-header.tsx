import Link from "next/link";
import { env } from "@/lib/env";
import { signOutSingleWorkspace } from "@/lib/actions/auth";
import type { Session } from "@/lib/types";
import { IconAiSpark } from "./icons";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/clients", label: "Projects" },
  { href: "/workflows", label: "Workflows" },
  { href: "/library", label: "Library" },
  { href: "/settings", label: "Settings" },
];

export async function AppHeader({ session }: { session: Session }) {
  let accountControls: React.ReactNode;
  if (env.singleWorkspace) {
    accountControls = (
      <form action={signOutSingleWorkspace} className="flex items-center gap-3">
        <span className="hidden text-sm text-navy-800/55 sm:inline">
          {session.userId}
        </span>
        <button
          type="submit"
          className="rounded-chip border-[1.5px] border-navy-800/25 px-3 py-1 text-sm font-semibold transition hover:border-navy-800"
        >
          Sign out
        </button>
      </form>
    );
  } else {
    const { OrganizationSwitcher, UserButton } = await import("@clerk/nextjs");
    accountControls = (
      <div className="flex items-center gap-3">
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl="/"
          afterCreateOrganizationUrl="/onboarding"
        />
        <UserButton />
      </div>
    );
  }

  return (
    <header className="sticky top-0 z-10 border-b border-navy-800/10 bg-cream-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2 text-mint-700">
          <IconAiSpark />
          <span className="font-display text-lg font-bold text-navy-900">
            Calyflow
          </span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-chip px-3 py-1.5 text-[15px] font-medium text-navy-800/70 transition hover:bg-cream-100 hover:text-navy-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {accountControls}
      </div>
    </header>
  );
}
