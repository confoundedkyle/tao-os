"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../auth";
import { db } from "../db";
import { encrypt } from "../crypto";
import { getConnection } from "../queries";
import { getAdapter, isLiveConnector } from "../integrations";

// Connector management. OAuth connectors connect via the route handlers
// (/api/connectors/<provider>/start); API-key connectors connect via the
// paste-key form below. Both store an encrypted token in workspace_connections.

export async function disconnectConnectionAction(provider: string) {
  const session = await requireAdmin();
  const { error } = await db()
    .from("workspace_connections")
    .delete()
    .eq("workspace_id", session.workspaceId)
    .eq("provider", provider);
  if (error) throw error;
  revalidatePath("/settings/connectors");
}

export interface ConnectApiKeyResult {
  ok: boolean;
  error?: string;
}

/** Validate + store an API key for an api-key connector (e.g. Ashby). */
export async function connectApiKeyAction(
  provider: string,
  apiKey: string,
): Promise<ConnectApiKeyResult> {
  const session = await requireAdmin();
  const key = apiKey.trim();
  if (!key) return { ok: false, error: "An API key is required" };
  if (!isLiveConnector(provider))
    return { ok: false, error: "Unsupported connector" };
  const adapter = getAdapter(provider)!;
  if (adapter.authType !== "apikey" || !adapter.validateApiKey)
    return { ok: false, error: "This connector doesn't use an API key" };

  const result = await adapter.validateApiKey(key);
  if (!result.ok) {
    return {
      ok: false,
      error: result.message ?? "That API key was rejected by the provider",
    };
  }

  const existing = await getConnection(session.workspaceId, provider);
  const row = {
    workspace_id: session.workspaceId,
    provider,
    access_token_cipher: encrypt(key),
    refresh_token_cipher: null,
    token_expires_at: null,
    account_label: result.accountLabel ?? null,
    scopes: null,
    status: "active",
    created_by: session.userId,
  };
  const { error } = existing
    ? await db()
        .from("workspace_connections")
        .update(row)
        .eq("id", existing.id)
    : await db().from("workspace_connections").insert(row);
  if (error) return { ok: false, error: "Could not save the connection" };

  revalidatePath("/settings/connectors");
  return { ok: true };
}
