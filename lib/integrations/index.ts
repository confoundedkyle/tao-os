import "server-only";
import { db } from "../db";
import { decrypt, encrypt } from "../crypto";
import type { Connection } from "../types";
import { airtableAdapter } from "./airtable";
import { apolloAdapter } from "./apollo";
import { ashbyAdapter } from "./ashby";
import { breezyhrAdapter } from "./breezyhr";
import { brightdataAdapter } from "./brightdata";
import { contactoutAdapter } from "./contactout";
import { greenhouseAdapter } from "./greenhouse";
import { hubspotAdapter } from "./hubspot";
import { hunterAdapter } from "./hunter";
import { lemlistAdapter } from "./lemlist";
import { loxoAdapter } from "./loxo";
import { lushaAdapter } from "./lusha";
import type { ConnectorAdapter } from "./types";

export type { ConnectorAdapter, ResourceRef } from "./types";

// Registry of live connectors. Catalog display lives in lib/connectors.ts; this
// is the set with a working backend.
const ADAPTERS: Record<string, ConnectorAdapter> = {
  airtable: airtableAdapter,
  apollo: apolloAdapter,
  ashby: ashbyAdapter,
  breezyhr: breezyhrAdapter,
  brightdata: brightdataAdapter,
  contactout: contactoutAdapter,
  greenhouse: greenhouseAdapter,
  hubspot: hubspotAdapter,
  hunter: hunterAdapter,
  lemlist: lemlistAdapter,
  loxo: loxoAdapter,
  lusha: lushaAdapter,
};

export function getAdapter(provider: string): ConnectorAdapter | null {
  return ADAPTERS[provider] ?? null;
}

export function isLiveConnector(provider: string): boolean {
  return provider in ADAPTERS;
}

const EXPIRY_SKEW_MS = 60_000; // refresh a minute early to avoid edge races

/**
 * Returns a usable access token for a connection, refreshing (and persisting the
 * rotated single-use refresh token) when the stored one is expired or near it.
 * Marks the connection status='error' on failure so the UI can prompt a reconnect.
 */
export async function getValidAccessToken(
  connection: Connection,
): Promise<string> {
  const adapter = getAdapter(connection.provider);
  if (!adapter) throw new Error(`No adapter for ${connection.provider}`);
  if (!connection.access_token_cipher) {
    await markError(connection.id);
    throw new Error(`${connection.provider} is not connected. Reconnect it in Settings → Connectors.`);
  }

  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : null;
  const expired = expiresAt !== null && expiresAt - EXPIRY_SKEW_MS <= Date.now();

  if (!expired) {
    try {
      return decrypt(connection.access_token_cipher);
    } catch {
      // fall through to refresh below
    }
  }

  // API-key connectors never expire and have no refresh path — a decrypt
  // failure above is terminal.
  if (adapter.authType !== "oauth" || !adapter.refreshToken) {
    await markError(connection.id);
    throw new Error(
      `Your ${connection.provider} connection couldn't be read. Reconnect it in Settings → Connectors.`,
    );
  }
  if (!connection.refresh_token_cipher) {
    await markError(connection.id);
    throw new Error(
      `Your ${connection.provider} connection expired. Reconnect it in Settings → Connectors.`,
    );
  }

  let refreshToken: string;
  try {
    refreshToken = decrypt(connection.refresh_token_cipher);
  } catch {
    await markError(connection.id);
    throw new Error(
      `Your ${connection.provider} connection couldn't be read. Reconnect it in Settings → Connectors.`,
    );
  }

  try {
    const tokens = await adapter.refreshToken!(refreshToken);
    await db()
      .from("workspace_connections")
      .update({
        access_token_cipher: encrypt(tokens.accessToken),
        // Persist the rotated refresh token; keep the old one if none returned.
        refresh_token_cipher: tokens.refreshToken
          ? encrypt(tokens.refreshToken)
          : connection.refresh_token_cipher,
        token_expires_at: tokens.expiresAt,
        scopes: tokens.scopes ?? connection.scopes,
        status: "active",
      })
      .eq("id", connection.id);
    return tokens.accessToken;
  } catch (error) {
    await markError(connection.id);
    throw new Error(
      `Couldn't refresh your ${connection.provider} connection (${
        error instanceof Error ? error.message : "unknown error"
      }). Reconnect it in Settings → Connectors.`,
    );
  }
}

async function markError(connectionId: string): Promise<void> {
  await db()
    .from("workspace_connections")
    .update({ status: "error" })
    .eq("id", connectionId);
}
