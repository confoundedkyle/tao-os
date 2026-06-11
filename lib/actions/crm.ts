"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { db } from "../db";
import { getAccount, getLead } from "../queries";
import type { CrmLeadStatus } from "../types";

// --- Accounts ---

export async function createAccountAction(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Account name is required");
  const { error } = await db().from("crm_accounts").insert({
    workspace_id: session.workspaceId,
    name,
    website: optional(formData.get("website")),
    industry: optional(formData.get("industry")),
    notes: optional(formData.get("notes")),
  });
  if (error) throw error;
  revalidatePath("/crm");
}

export async function updateAccountAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Account name is required");
  const account = await getAccount(session.workspaceId, id);
  if (!account) throw new Error("Account not found");
  const { error } = await db()
    .from("crm_accounts")
    .update({
      name,
      website: optional(formData.get("website")),
      industry: optional(formData.get("industry")),
      notes: optional(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/crm");
}

export async function deleteAccountAction(accountId: string) {
  const session = await requireSession();
  const account = await getAccount(session.workspaceId, accountId);
  if (!account) throw new Error("Account not found");
  // Leads keep their row but lose the link (FK is ON DELETE SET NULL).
  const { error } = await db()
    .from("crm_accounts")
    .delete()
    .eq("id", accountId);
  if (error) throw error;
  revalidatePath("/crm");
}

// --- Leads ---

export async function createLeadAction(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Lead name is required");
  const { error } = await db().from("crm_leads").insert({
    workspace_id: session.workspaceId,
    account_id: await resolveAccountId(session.workspaceId, formData),
    name,
    email: optional(formData.get("email")),
    phone: optional(formData.get("phone")),
    title: optional(formData.get("title")),
    status: leadStatus(formData.get("status")),
    notes: optional(formData.get("notes")),
  });
  if (error) throw error;
  revalidatePath("/crm");
}

export async function updateLeadAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Lead name is required");
  const lead = await getLead(session.workspaceId, id);
  if (!lead) throw new Error("Lead not found");
  const { error } = await db()
    .from("crm_leads")
    .update({
      account_id: await resolveAccountId(session.workspaceId, formData),
      name,
      email: optional(formData.get("email")),
      phone: optional(formData.get("phone")),
      title: optional(formData.get("title")),
      status: leadStatus(formData.get("status")),
      notes: optional(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/crm");
}

export async function deleteLeadAction(leadId: string) {
  const session = await requireSession();
  const lead = await getLead(session.workspaceId, leadId);
  if (!lead) throw new Error("Lead not found");
  const { error } = await db().from("crm_leads").delete().eq("id", leadId);
  if (error) throw error;
  revalidatePath("/crm");
}

// --- helpers ---

function optional(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

const LEAD_STATUSES: CrmLeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
];

function leadStatus(value: FormDataEntryValue | null): CrmLeadStatus {
  const s = String(value ?? "");
  return (LEAD_STATUSES as string[]).includes(s)
    ? (s as CrmLeadStatus)
    : "new";
}

/** Validate the chosen account belongs to this workspace, else store no link. */
async function resolveAccountId(
  workspaceId: string,
  formData: FormData,
): Promise<string | null> {
  const accountId = optional(formData.get("account_id"));
  if (!accountId) return null;
  const account = await getAccount(workspaceId, accountId);
  return account ? accountId : null;
}
