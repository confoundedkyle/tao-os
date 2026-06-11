import { env } from "@/lib/env";
import { signOutSingleWorkspace } from "@/lib/actions/auth";
import type { Session } from "@/lib/types";

/** Org switcher + user button (Clerk) or the single-workspace sign-out row.
 *  Rendered top-right on laptop and inside the mobile menu drawer. */
export async function AccountControls({ session }: { session: Session }) {
  if (env.singleWorkspace) {
    return (
      <form
        action={signOutSingleWorkspace}
        className="flex w-full items-center justify-between gap-3"
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
  }

  const { OrganizationSwitcher, UserButton } = await import("@clerk/nextjs");
  return (
    <div className="flex w-full items-center justify-between gap-3">
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
