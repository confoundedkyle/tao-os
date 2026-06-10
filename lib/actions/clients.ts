"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "../auth";
import { db } from "../db";
import { getClient, getProject } from "../queries";

export async function createClientAction(formData: FormData) {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Client name is required");
  const { data, error } = await db()
    .from("clients")
    .insert({ workspace_id: session.workspaceId, name })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath("/clients");
  redirect(`/clients/${data.id}`);
}

export async function createProjectAction(formData: FormData) {
  const session = await requireSession();
  const clientId = String(formData.get("clientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Project name is required");
  const client = await getClient(session.workspaceId, clientId);
  if (!client) throw new Error("Client not found");
  const { data, error } = await db()
    .from("projects")
    .insert({ client_id: clientId, name })
    .select("id")
    .single();
  if (error) throw error;
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}/projects/${data.id}`);
}

export async function setProjectStatusAction(
  projectId: string,
  status: "active" | "archived",
) {
  const session = await requireSession();
  const project = await getProject(session.workspaceId, projectId);
  if (!project) throw new Error("Project not found");
  const { error } = await db()
    .from("projects")
    .update({ status })
    .eq("id", projectId);
  if (error) throw error;
  revalidatePath(`/clients/${project.client_id}`);
  revalidatePath(`/clients/${project.client_id}/projects/${projectId}`);
}
