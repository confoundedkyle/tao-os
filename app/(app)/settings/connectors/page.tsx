import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listConnections } from "@/lib/queries";
import { ConnectorsGrid } from "@/components/connectors-grid";

export default async function ConnectorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    error?: string;
    category?: string;
  }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const { connected, error, category } = await searchParams;
  const connections = (await listConnections(session.workspaceId)).map((c) => ({
    provider: c.provider,
    accountLabel: c.account_label,
    status: c.status,
  }));

  return (
    <>
      <p className="mb-6 max-w-2xl text-sm text-navy-800/55">
        Bring your ATS, CRM, and sourcing tools into Calyflow — connect a source
        so your data agents can read from it.
      </p>

      {connected && (
        <p className="mb-5 rounded-card border border-mint-400/30 bg-mint-400/10 px-4 py-3 text-sm text-mint-700">
          ✓ Connected {connected}. Your data agents can now read from it.
        </p>
      )}
      {error && (
        <p className="mb-5 rounded-card border border-coral-400/30 bg-coral-400/10 px-4 py-3 text-sm text-coral-400">
          {error === "not_configured"
            ? "This connector isn't configured on the server yet (missing OAuth credentials)."
            : error === "bad_state"
              ? "Couldn't complete the connection — the session expired. Please try again."
              : `Couldn't connect: ${error}`}
        </p>
      )}

      <ConnectorsGrid
        connections={connections}
        canManage={session.role === "admin"}
        initialFilter={category}
      />
    </>
  );
}
