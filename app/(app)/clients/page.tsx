import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listClients } from "@/lib/queries";
import { createClientAction } from "@/lib/actions/clients";
import {
  ArchivedClientActions,
  ClientCardActions,
} from "@/components/client-actions";
import { Button, Card, EmptyState, inputClass, PageHeader } from "@/components/ui";
import { IconClientsBuilding } from "@/components/icons";

export default async function ClientsPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const clients = await listClients(session.workspaceId);
  const active = clients.filter((c) => c.status === "active");
  const archived = clients.filter((c) => c.status !== "active");

  return (
    <>
      <PageHeader
        title="Clients & Projects"
        description="Each client has its own knowledge base, files, and projects."
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
          <Button type="submit">Create a client</Button>
        </form>
      </Card>

      {active.length === 0 && archived.length === 0 ? (
        <EmptyState
          icon={<IconClientsBuilding size={48} className="text-navy-800/60" />}
          title="No clients yet"
          description="Create your first client above, then open a new project for each position you're filling."
        />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((client) => (
              <Card key={client.id} className="relative h-full">
                <IconClientsBuilding size={32} className="mb-3 text-navy-800" />
                <ClientCardActions clientId={client.id} name={client.name} />
                <p className="mt-2 text-sm text-navy-800/45">
                  since{" "}
                  {new Date(client.created_at).toLocaleDateString("en-GB", {
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </Card>
            ))}
            {active.length === 0 && (
              <p className="text-sm text-navy-800/45 sm:col-span-2 lg:col-span-3">
                No active clients — restore one below or create a new one above.
              </p>
            )}
          </div>

          {archived.length > 0 && (
            <div className="mt-10">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-navy-800/40">
                Archived
              </h2>
              <ul className="divide-y divide-navy-800/8 rounded-card border border-navy-800/10 bg-white/50 px-4">
                {archived.map((client) => (
                  <li
                    key={client.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-navy-800/45">
                      {client.name}
                    </span>
                    <ArchivedClientActions
                      clientId={client.id}
                      name={client.name}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
