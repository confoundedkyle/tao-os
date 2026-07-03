import Link from "next/link";
import type { ModuleKey, Session } from "@/lib/types";
import { IconAiSpark } from "./icons";
import { AccountControls } from "./account-controls";
import { PoweredBy } from "./powered-by";
import { MobileNav } from "./mobile-nav";
import type { ClientWithProjects } from "./sidebar-nav";

/** Mobile: logo left, hamburger right. Laptop: account controls top right. */
export function AppTopbar({
  session,
  clients,
  demo = null,
  modules = [],
  isAdmin = false,
}: {
  session: Session;
  clients: ClientWithProjects[];
  demo?: ClientWithProjects | null;
  modules?: ModuleKey[];
  /** Platform admin — shows the Admin button. */
  isAdmin?: boolean;
}) {
  return (
    <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-navy-800/10 bg-cream-50 px-4 py-2 sm:px-6 lg:justify-end lg:border-0 lg:bg-transparent lg:px-10 lg:py-4">
      <Link
        href="/"
        className="flex items-center gap-2 text-mint-700 lg:hidden"
      >
        <IconAiSpark size={20} />
        <span className="font-display text-base font-bold text-navy-900">
          TAO OS
        </span>
      </Link>

      <div className="hidden w-auto items-center gap-3 lg:flex">
        <PoweredBy workspaceId={session.workspaceId} />
        <Link
          href="/setup-help"
          className="flex-shrink-0 whitespace-nowrap rounded-full border border-mint-400/50 px-3 py-1 text-xs font-semibold text-mint-700 transition hover:bg-mint-400/10"
        >
          Setup Help
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            className="flex-shrink-0 whitespace-nowrap rounded-full border border-navy-800/20 bg-navy-800 px-3 py-1 text-xs font-semibold text-white transition hover:bg-navy-900"
          >
            Admin
          </Link>
        )}
        <AccountControls session={session} />
      </div>

      <MobileNav clients={clients} demo={demo} modules={modules}>
        <AccountControls session={session} />
      </MobileNav>
    </header>
  );
}
