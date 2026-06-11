import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "./auth";
import { listActiveModuleKeys } from "./queries";
import type { ModuleKey, Session } from "./types";

/**
 * Page guard for module routes: requires a session and the module to be
 * active for the workspace, otherwise redirects (sign-in / dashboard).
 */
export async function requireModulePage(key: ModuleKey): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  const active = await listActiveModuleKeys(session.workspaceId);
  if (!active.includes(key)) redirect("/");
  return session;
}
