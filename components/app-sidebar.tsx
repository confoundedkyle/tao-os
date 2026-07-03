import Link from "next/link";
import type { ModuleKey } from "@/lib/types";
import { IconAiSpark } from "./icons";
import { SidebarNav, type ClientWithProjects } from "./sidebar-nav";

/** Desktop-only navigation rail; on mobile the same nav lives in MobileNav. */
export function AppSidebar({
  clients,
  demo = null,
  modules = [],
}: {
  clients: ClientWithProjects[];
  demo?: ClientWithProjects | null;
  modules?: ModuleKey[];
}) {
  return (
    <aside className="hidden h-full w-56 flex-shrink-0 flex-col border-r border-navy-800/10 bg-cream-50 lg:flex">
      <div className="flex-shrink-0 px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-mint-700">
          <IconAiSpark size={20} />
          <span className="font-display text-base font-bold text-navy-900">
            TAO OS
          </span>
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav clients={clients} demo={demo} modules={modules} />
      </div>
    </aside>
  );
}
