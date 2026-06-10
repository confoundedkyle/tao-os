import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  // Abandon-safe wizard: the workspace already works with safe defaults;
  // nudge into onboarding until a type has been picked (SPEC §9).
  if (!session.workspace.workspace_type) redirect("/onboarding");

  return (
    <>
      <AppHeader session={session} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {children}
      </main>
      <footer className="bg-navy-900 py-6 text-center text-sm text-cream-50/70">
        Calyflow — open-source recruiting OS ·{" "}
        <span className="font-mono">AGPL-3.0</span>
      </footer>
    </>
  );
}
