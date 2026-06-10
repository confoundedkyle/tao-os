import Link from "next/link";
import { env } from "@/lib/env";
import { listClientsWithProjects } from "@/lib/queries";
import { signOutSingleWorkspace } from "@/lib/actions/auth";
import type { Session } from "@/lib/types";
import { IconAiSpark } from "./icons";
import { SidebarNav } from "./sidebar-nav";

export async function AppSidebar({ session }: { session: Session }) {
  const clients = await listClientsWithProjects(session.workspace.id);

  let accountControls: React.ReactNode;
  if (env.singleWorkspace) {
    accountControls = (
      <form
        action={signOutSingleWorkspace}
        className="flex items-center justify-between gap-2"
      >
        <span className="truncate text-xs text-navy-800/45">
          {session.userId}
        </span>
        <button
          type="submit"
          className="flex-shrink-0 rounded-md border border-navy-800/20 px-2 py-1 text-xs font-medium transition-colors hover:border-navy-800/50"
        >
          Sign out
        </button>
      </form>
    );
  } else {
    const { OrganizationSwitcher, UserButton } = await import("@clerk/nextjs");
    accountControls = (
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 overflow-hidden">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/"
            afterCreateOrganizationUrl="/onboarding"
            appearance={{
              elements: {
                rootBox: "w-full min-w-0",
                organizationSwitcherTrigger:
                  "w-full min-w-0 max-w-full justify-start gap-1",
                organizationPreview: "min-w-0",
                organizationPreviewTextContainer: "min-w-0",
                organizationPreviewMainIdentifier: "truncate block",
              },
            }}
          />
        </div>
        <div className="flex-shrink-0">
          <UserButton />
        </div>
      </div>
    );
  }

  return (
    <aside className="flex h-full w-56 flex-shrink-0 flex-col border-r border-navy-800/10 bg-cream-50">
      <div className="flex-shrink-0 px-4 py-4">
        <Link href="/" className="flex items-center gap-2 text-mint-700">
          <IconAiSpark size={20} />
          <span className="font-display text-base font-bold text-navy-900">
            Calyflow
          </span>
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNav clients={clients} />
      </div>

      <div className="flex-shrink-0 border-t border-navy-800/10 px-4 py-3">
        {accountControls}
      </div>
    </aside>
  );
}
