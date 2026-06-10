import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!session.workspace.workspace_type) redirect("/onboarding");

  return (
    <div className="flex h-dvh overflow-hidden">
      <AppSidebar session={session} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex flex-1 flex-col overflow-y-auto px-10 pt-10">
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
