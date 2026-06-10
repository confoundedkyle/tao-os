import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { Card } from "@/components/ui";

export default async function MembersPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  if (env.singleWorkspace) {
    const adminEmails = env.adminEmails;
    const isAdmin = session.role === "admin";

    return (
      <div className="max-w-3xl space-y-6">
        <Card>
          <h2 className="mb-4 text-xl font-semibold">Members</h2>
          <div className="flex items-center justify-between rounded-lg border border-navy-800/10 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-navy-900">{session.userId}</p>
              <p className="text-xs text-navy-800/45">Signed in</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isAdmin
                  ? "bg-mint-400/20 text-mint-700"
                  : "bg-cream-100 text-navy-800/55"
              }`}
            >
              {isAdmin ? "Owner" : "Member"}
            </span>
          </div>

          {adminEmails.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-navy-800/35">
                Configured owners (ADMIN_EMAILS)
              </p>
              <div className="space-y-2">
                {adminEmails
                  .filter((e) => e !== session.userId)
                  .map((email) => (
                    <div
                      key={email}
                      className="flex items-center justify-between rounded-lg border border-navy-800/10 px-4 py-3"
                    >
                      <p className="text-sm text-navy-800/70">{email}</p>
                      <span className="rounded-full bg-mint-400/20 px-2.5 py-0.5 text-xs font-semibold text-mint-700">
                        Owner
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Card>

        <p className="text-sm text-navy-800/45">
          Single-workspace mode: every user who signs in lands here. Set{" "}
          <span className="font-mono text-[13px]">ADMIN_EMAILS</span> to
          designate owners.
        </p>
      </div>
    );
  }

  const { OrganizationProfile } = await import("@clerk/nextjs");
  return (
    <div className="max-w-3xl">
      <p className="mb-4 text-sm text-navy-800/55">
        Invite teammates by email — they&apos;ll see the same clients,
        projects, and workflows. The role badge marks the workspace owner.
      </p>
      <OrganizationProfile routing="hash" />
    </div>
  );
}
