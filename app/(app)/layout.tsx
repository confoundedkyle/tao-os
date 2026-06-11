import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listClientsWithProjects } from "@/lib/queries";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!session.workspace.workspace_type) redirect("/onboarding");
  const clients = await listClientsWithProjects(session.workspace.id);

  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar clients={clients} />
      {/* min-w-0 lets grids/tables shrink instead of overflowing on mobile */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppTopbar session={session} clients={clients} />
        <main className="flex flex-1 flex-col overflow-y-auto px-4 pt-6 sm:px-6 lg:px-10 lg:pt-2">
          <div className="flex-1">{children}</div>
          <footer className="mt-16 border-t border-navy-800/8 py-4 text-center text-xs text-navy-800/35">
            Calyflow — open-source recruiting OS ·{" "}
            <span className="font-mono">AGPL-3.0</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
