import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listModules } from "@/lib/queries";
import { ModulesGrid } from "@/components/modules-grid";

export default async function ModulesPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in");

  const modules = await listModules(session.workspaceId);
  const activeKeys = modules.filter((m) => m.is_active).map((m) => m.module_key);

  return (
    <>
      <p className="mb-6 max-w-2xl text-sm text-navy-800/55">
        Activate modules to add their workspaces to your sidebar. Deactivating a
        module only hides it from the sidebar — your data is kept and reappears
        when you switch it back on.
      </p>

      <ModulesGrid
        activeKeys={activeKeys}
        canManage={session.role === "admin"}
      />
    </>
  );
}
