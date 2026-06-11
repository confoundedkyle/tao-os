"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { db } from "../db";
import { getCandidate, getProject } from "../queries";
import type { AtsCandidateStatus } from "../types";

export async function createCandidateAction(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Candidate name is required");
  const { error } = await db().from("ats_candidates").insert({
    workspace_id: session.workspaceId,
    project_id: await resolveProjectId(session.workspaceId, formData),
    name,
    email: optional(formData.get("email")),
    phone: optional(formData.get("phone")),
    status: candidateStatus(formData.get("status")),
    notes: optional(formData.get("notes")),
  });
  if (error) throw error;
  revalidatePath("/ats");
}

export async function updateCandidateAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Candidate name is required");
  const candidate = await getCandidate(session.workspaceId, id);
  if (!candidate) throw new Error("Candidate not found");
  const { error } = await db()
    .from("ats_candidates")
    .update({
      project_id: await resolveProjectId(session.workspaceId, formData),
      name,
      email: optional(formData.get("email")),
      phone: optional(formData.get("phone")),
      status: candidateStatus(formData.get("status")),
      notes: optional(formData.get("notes")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/ats");
}

export async function deleteCandidateAction(candidateId: string) {
  const session = await requireSession();
  const candidate = await getCandidate(session.workspaceId, candidateId);
  if (!candidate) throw new Error("Candidate not found");
  const { error } = await db()
    .from("ats_candidates")
    .delete()
    .eq("id", candidateId);
  if (error) throw error;
  revalidatePath("/ats");
}

// --- helpers ---

function optional(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

const CANDIDATE_STATUSES: AtsCandidateStatus[] = [
  "sourced",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
];

function candidateStatus(value: FormDataEntryValue | null): AtsCandidateStatus {
  const s = String(value ?? "");
  return (CANDIDATE_STATUSES as string[]).includes(s)
    ? (s as AtsCandidateStatus)
    : "sourced";
}

/** Validate the chosen project belongs to this workspace, else store no link. */
async function resolveProjectId(
  workspaceId: string,
  formData: FormData,
): Promise<string | null> {
  const projectId = optional(formData.get("project_id"));
  if (!projectId) return null;
  const project = await getProject(workspaceId, projectId);
  return project ? projectId : null;
}
