"use server";

import { revalidatePath } from "next/cache";
import { requireSession, syncClerkUserName } from "../auth";
import { db } from "../db";

// Personal preferences are per-user, not per-workspace settings — any member
// edits their own, so these use requireSession (not requireAdmin).

/** Strip the scheme, leading www., and any path so we store a bare domain
 *  (the field asks for "domain without https"). */
function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim();
}

async function upsertPrefs(
  workspaceId: string,
  userId: string,
  patch: Record<string, string | null>,
) {
  const { error } = await db()
    .from("user_preferences")
    .upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,user_id" },
    );
  if (error) throw error;
}

export async function updatePersonalNameAction(formData: FormData) {
  const session = await requireSession();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();

  // Clerk is the source of truth for the name; mirror it into user_preferences
  // so agent runs can read it without a Clerk round-trip.
  await syncClerkUserName(session.userId, firstName, lastName);
  await upsertPrefs(session.workspaceId, session.userId, {
    first_name: firstName || null,
    last_name: lastName || null,
  });
  revalidatePath("/settings/personal");
}

export async function updateEmailPrefsAction(formData: FormData) {
  const session = await requireSession();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const companyWebsite = normalizeDomain(String(formData.get("companyWebsite") ?? ""));
  const signature = String(formData.get("signature") ?? "").trim();

  await upsertPrefs(session.workspaceId, session.userId, {
    company_name: companyName || null,
    company_website: companyWebsite || null,
    email_signature: signature || null,
  });
  revalidatePath("/settings/personal");
}
