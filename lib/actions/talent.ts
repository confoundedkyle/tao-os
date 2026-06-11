"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { db } from "../db";
import { getProspect } from "../queries";

export async function createProspectAction(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Prospect name is required");
  const { error } = await db().from("talent_prospects").insert({
    workspace_id: session.workspaceId,
    name,
    email: optional(formData.get("email")),
    phone: optional(formData.get("phone")),
    country: optional(formData.get("country")),
    city: optional(formData.get("city")),
    linkedin_url: optional(formData.get("linkedin_url")),
    notes: optional(formData.get("notes")),
  });
  if (error) throw error;
  revalidatePath("/talent-pool");
}

export async function updateProspectAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Prospect name is required");
  const prospect = await getProspect(session.workspaceId, id);
  if (!prospect) throw new Error("Prospect not found");
  const { error } = await db()
    .from("talent_prospects")
    .update({
      name,
      email: optional(formData.get("email")),
      phone: optional(formData.get("phone")),
      country: optional(formData.get("country")),
      city: optional(formData.get("city")),
      linkedin_url: optional(formData.get("linkedin_url")),
      notes: optional(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/talent-pool");
  revalidatePath(`/talent-pool/${id}`);
}

export async function deleteProspectAction(prospectId: string) {
  const session = await requireSession();
  const prospect = await getProspect(session.workspaceId, prospectId);
  if (!prospect) throw new Error("Prospect not found");

  // Remove any prospect-scoped documents (CVs) and their stored uploads.
  const { data: docs } = await db()
    .from("documents")
    .select("id, storage_path")
    .eq("workspace_id", session.workspaceId)
    .eq("scope_type", "prospect")
    .eq("scope_id", prospectId);
  const paths = (docs ?? [])
    .map((d) => d.storage_path)
    .filter((p): p is string => !!p);
  if (paths.length > 0) {
    await db().storage.from("documents").remove(paths);
  }
  await db()
    .from("documents")
    .delete()
    .eq("workspace_id", session.workspaceId)
    .eq("scope_type", "prospect")
    .eq("scope_id", prospectId);

  const { error } = await db()
    .from("talent_prospects")
    .delete()
    .eq("id", prospectId);
  if (error) throw error;
  revalidatePath("/talent-pool");
}

function optional(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}
