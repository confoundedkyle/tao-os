import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { Card } from "@/components/ui";

export default async function MembersPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  if (env.singleWorkspace) {
    return (
      <Card className="max-w-3xl">
        <h2 className="mb-2 text-xl font-semibold">Members</h2>
        <p className="text-navy-800/55">
          This instance runs in single-workspace mode: every user who signs in
          lands in this workspace. Owners are set via the{" "}
          <span className="font-mono text-[13px]">ADMIN_EMAILS</span>{" "}
          environment variable.
        </p>
      </Card>
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
