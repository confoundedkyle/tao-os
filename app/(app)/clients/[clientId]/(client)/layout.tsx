import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getClient } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ClientTabNav } from "@/components/client-tab-nav";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const { clientId } = await params;
  const client = await getClient(session.workspaceId, clientId);
  if (!client) notFound();

  return (
    <>
      <div className="mb-2 text-sm text-navy-800/45">
        <Link href="/clients" className="hover:text-mint-700">
          Clients
        </Link>
      </div>
      <PageHeader title={client.name} />
      <ClientTabNav basePath={`/clients/${clientId}`} />
      {children}
    </>
  );
}
