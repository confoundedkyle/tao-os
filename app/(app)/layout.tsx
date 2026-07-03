import Link from "next/link";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getSession, isPlatformAdmin } from "@/lib/auth";
import {
  getDemoClientWithProject,
  listActiveModuleKeys,
  listClientsWithProjects,
} from "@/lib/queries";
import { ensureDemoProject, TEMPLATE_VERSION } from "@/lib/demo";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { PostHogIdentify } from "@/components/posthog-identify";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (!session.workspace.workspace_type) redirect("/onboarding");
  const [clients, modules, admin] = await Promise.all([
    listClientsWithProjects(session.workspace.id),
    listActiveModuleKeys(session.workspace.id),
    isPlatformAdmin(),
  ]);

  // The per-user Demo project lives in the sidebar's DEMO section. Provision (or
  // re-sync to the latest template) only when it's missing or behind, so steady
  // state is a single read; failures never block the app shell. Skip entirely
  // when the workspace has dismissed it (Hide).
  let demo = session.workspace.demo_hidden
    ? null
    : await getDemoClientWithProject(session.workspace.id);
  const demoProject = demo?.projects[0];
  const demoStale =
    !session.workspace.demo_hidden &&
    (!demoProject || (demoProject.template_version ?? 0) < TEMPLATE_VERSION);
  if (demoStale) {
    try {
      await ensureDemoProject(session.workspace.id, session.userId);
      demo = await getDemoClientWithProject(session.workspace.id);
    } catch (err) {
      console.warn("ensureDemoProject failed:", err);
    }
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <PostHogIdentify
        userId={session.userId}
        workspaceId={session.workspaceId}
        workspaceName={session.workspace.name}
        workspaceType={session.workspace.workspace_type}
      />
      <AppSidebar clients={clients} demo={demo} modules={modules} />
      {/* min-w-0 lets grids/tables shrink instead of overflowing on mobile */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppTopbar
          session={session}
          clients={clients}
          demo={demo}
          modules={modules}
          isAdmin={admin}
        />
        {/* `relative` makes <main> the containing block for absolutely-positioned
            descendants (e.g. Tailwind `sr-only` file inputs). Without it they
            anchor to <body> at their in-flow offset, escaping this scroller's
            overflow and adding phantom page height below the viewport. */}
        <main className="relative flex flex-1 flex-col overflow-y-auto px-4 pt-6 sm:px-6 lg:px-10 lg:pt-2">
          <div className="flex-1">{children}</div>
          <footer className="mt-16 border-t border-navy-800/8 py-4 text-center text-xs text-navy-800/35">
            TAO OS — open-source talent acquisition platform ·{" "}
            <span className="font-mono">AGPL-3.0</span> ·{" "}
            <Link href="/docs" className="hover:text-mint-700">
              Docs
            </Link>{" "}
            ·{" "}
            <a
              href={`mailto:${config.contactEmail}`}
              className="hover:text-mint-700"
            >
              Contact: {config.contactEmail}
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
