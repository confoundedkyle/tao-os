import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ConnectorsGrid } from "@/components/connectors-grid";

export default async function ConnectorsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  return (
    <>
      <p className="mb-6 max-w-2xl text-sm text-navy-800/55">
        Bring your ATS, CRM, and sourcing tools into Calyflow — activation is
        rolling out soon.
      </p>
      <ConnectorsGrid />
    </>
  );
}
