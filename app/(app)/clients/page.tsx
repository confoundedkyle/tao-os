import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listClients } from "@/lib/queries";
import { createClientAction } from "@/lib/actions/clients";
import { Button, Card, EmptyState, inputClass, PageHeader } from "@/components/ui";
import { IconClientsBuilding } from "@/components/icons";

export default async function ClientsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const clients = await listClients(session.workspaceId);

  return (
    <>
      <PageHeader
        title="Clients"
        description="The companies you recruit for. Each client keeps its own knowledge base and files across every search."
      />
      <Card className="mb-8">
        <form action={createClientAction} className="flex flex-wrap items-end gap-3">
          <label className="min-w-60 flex-1">
            <span className="mb-1.5 block text-sm font-semibold text-navy-800/80">
              New client
            </span>
            <input
              name="name"
              required
              placeholder="e.g. Acme GmbH"
              className={inputClass}
            />
          </label>
          <Button type="submit">Create client</Button>
        </form>
      </Card>

      {clients.length === 0 ? (
        <EmptyState
          icon={<IconClientsBuilding size={48} className="text-navy-800/60" />}
          title="No clients yet"
          description="Create your first client above — then open a project for each role you're filling."
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="h-full hover:-translate-y-0.5 hover:shadow-lift">
                <IconClientsBuilding size={32} className="mb-3 text-navy-800" />
                <h3 className="text-lg font-semibold">{client.name}</h3>
                <p className="text-sm text-navy-800/45">
                  since{" "}
                  {new Date(client.created_at).toLocaleDateString("en-GB", {
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
