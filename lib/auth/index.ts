import "server-only";
import { cookies } from "next/headers";
import { env } from "../env";
import { verify } from "../crypto";
import { ensureWorkspace } from "../workspace";
import type { Session } from "../types";

// The ONLY module (plus components/auth-ui.tsx for prebuilt widgets) that
// touches Clerk. Everything else calls getSession()/requireSession() —
// SPEC §13: auth behind a thin server-side wrapper.

export const SINGLE_WORKSPACE_ORG_ID = "single-workspace";
export const SESSION_COOKIE = "calyflow_session";

export async function getSession(): Promise<Session | null> {
  return env.singleWorkspace ? getSingleWorkspaceSession() : getClerkSession();
}

/** Throws if unauthenticated — use in server actions and route handlers. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  return session;
}

/** Admin ("Owner") gate for settings mutations — enforced server-side. */
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "admin") {
    throw new Error("Only the workspace owner can do this");
  }
  return session;
}

async function getClerkSession(): Promise<Session | null> {
  const { auth, clerkClient } = await import("@clerk/nextjs/server");
  const { userId, orgId, orgRole } = await auth();
  if (!userId) return null;

  let clerkOrgId = orgId ?? null;
  let role: Session["role"] =
    orgRole === "org:admin" ? "admin" : orgId ? "member" : "admin";

  if (!clerkOrgId) {
    // First authenticated request with no active org: reuse the user's first
    // org, or auto-create one with safe defaults (SPEC §9).
    const client = await clerkClient();
    const memberships = await client.users.getOrganizationMembershipList({
      userId,
    });
    const first = memberships.data[0];
    if (first) {
      clerkOrgId = first.organization.id;
      role = first.role === "org:admin" ? "admin" : "member";
    } else {
      const org = await client.organizations.createOrganization({
        name: "Default workspace",
        createdBy: userId,
      });
      clerkOrgId = org.id;
      role = "admin";
    }
  }

  const workspace = await ensureWorkspace(clerkOrgId, "Default workspace");
  return { userId, workspaceId: workspace.id, role, workspace };
}

async function getSingleWorkspaceSession(): Promise<Session | null> {
  const jar = await cookies();
  const cookie = jar.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  const email = verify(cookie)?.toLowerCase();
  if (!email) return null;

  const admins = env.adminEmails;
  const role: Session["role"] =
    admins.length === 0 || admins.includes(email) ? "admin" : "member";
  const workspace = await ensureWorkspace(
    SINGLE_WORKSPACE_ORG_ID,
    "Default workspace",
  );
  return { userId: email, workspaceId: workspace.id, role, workspace };
}
