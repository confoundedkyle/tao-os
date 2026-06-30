"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth";
import { db } from "../db";
import { getConnection, getProject, listConnections } from "../queries";
import { getValidAccessToken } from "../integrations";
import {
  LIVE_EMAIL_ENRICHMENT_PROVIDERS,
  connectorLabel,
} from "../connectors";
import { connectedProvidersFrom } from "../run-items";
import { findEmailViaProvider } from "../enrichment/find-email";
import {
  canonicalLinkedinUrl,
  normalizeLinkedinUrl,
  type EnrichmentImportRow,
} from "../enrichment/csv";
import type { Candidate } from "../types";

/** A candidate row scoped + verified to the caller's workspace. */
async function loadCandidate(
  workspaceId: string,
  candidateId: string,
): Promise<Candidate> {
  const { data } = await db()
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .maybeSingle();
  if (!data || (data as Candidate).workspace_id !== workspaceId) {
    throw new Error("Candidate not found");
  }
  return data as Candidate;
}

function mergeRaw(
  existing: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return { ...(existing ?? {}), ...extra };
}

export interface FindEmailActionResult {
  email: string | null;
  /** Display name of the provider that ran. */
  provider: string;
}

/**
 * One-click email lookup for a single candidate (the Shortlist "Find email"
 * button). Picks the workspace's first connected live-enrichment connector,
 * enriches by the candidate's LinkedIn URL, and saves the email. Throws a
 * user-friendly error when nothing is connected or the candidate has no
 * LinkedIn URL — the UI catches it and opens the enrichment dialog instead.
 */
export async function findCandidateEmailAction(
  candidateId: string,
): Promise<FindEmailActionResult> {
  const session = await requireSession();
  const candidate = await loadCandidate(session.workspaceId, candidateId);

  if (candidate.email) {
    return { email: candidate.email, provider: "" };
  }
  if (!candidate.linkedin?.trim()) {
    throw new Error(
      "This candidate has no LinkedIn URL, so there's nothing to look up.",
    );
  }

  const connected = connectedProvidersFrom(
    await listConnections(session.workspaceId),
  );
  const provider = LIVE_EMAIL_ENRICHMENT_PROVIDERS.find((p) =>
    connected.has(p),
  );
  if (!provider) {
    throw new Error("NO_ENRICHMENT_TOOL");
  }

  const connection = await getConnection(session.workspaceId, provider);
  if (!connection) throw new Error("NO_ENRICHMENT_TOOL");
  const token = await getValidAccessToken(connection);

  // Use the canonical, slash-terminated URL so the provider pairs the profile
  // even for candidates stored before we started canonicalizing on save.
  const lookupUrl =
    canonicalLinkedinUrl(candidate.linkedin) ?? candidate.linkedin.trim();
  const { email, detail } = await findEmailViaProvider(
    provider,
    token,
    lookupUrl,
  );

  if (email) {
    const { error } = await db()
      .from("candidates")
      .update({
        email,
        raw: mergeRaw(candidate.raw, {
          email_source: provider,
          email_enriched_at: new Date().toISOString(),
        }),
      })
      .eq("id", candidate.id);
    if (error) throw error;

    const project = await getProject(session.workspaceId, candidate.project_id);
    if (project) {
      revalidatePath(
        `/clients/${project.client_id}/projects/${candidate.project_id}/shortlist`,
      );
    }
  } else {
    // Record the miss so a later run knows we already tried this provider.
    await db()
      .from("candidates")
      .update({
        raw: mergeRaw(candidate.raw, {
          email_lookup_miss: provider,
          email_lookup_detail: detail.slice(0, 500),
        }),
      })
      .eq("id", candidate.id);
  }

  return { email, provider: connectorLabel(provider) };
}

export interface ImportEmailsActionResult {
  /** Candidates whose (previously empty) email we filled in. */
  updated: number;
  /** Rows that matched a candidate already holding an email — left untouched. */
  alreadyHadEmail: number;
  /** Rows whose email matched no candidate in this project. */
  unmatched: number;
}

/**
 * Save emails from an enriched CSV back onto the project's candidates. Matches
 * each row to a candidate by our `calyflow_id` column when present, else by a
 * normalized LinkedIn URL. Only fills candidates that don't already have an
 * email (the export covered exactly those), so a re-import never clobbers a
 * confirmed address.
 */
export async function importEnrichedEmailsAction(
  projectId: string,
  rows: EnrichmentImportRow[],
): Promise<ImportEmailsActionResult> {
  const session = await requireSession();
  const project = await getProject(session.workspaceId, projectId);
  if (!project) throw new Error("Project not found");

  const { data, error } = await db()
    .from("candidates")
    .select("*")
    .eq("project_id", projectId);
  if (error) throw error;
  const candidates = (data ?? []) as Candidate[];

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const byLinkedin = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = normalizeLinkedinUrl(c.linkedin);
    if (key) byLinkedin.set(key, c);
  }

  let updated = 0;
  let alreadyHadEmail = 0;
  let unmatched = 0;
  // Don't write the same candidate twice if duplicate rows resolve to it.
  const handled = new Set<string>();

  for (const row of rows) {
    const match =
      (row.id ? byId.get(row.id) : undefined) ??
      byLinkedin.get(normalizeLinkedinUrl(row.linkedin));
    if (!match) {
      unmatched++;
      continue;
    }
    if (handled.has(match.id)) continue;
    handled.add(match.id);

    if (match.email?.trim()) {
      alreadyHadEmail++;
      continue;
    }
    const { error: upErr } = await db()
      .from("candidates")
      .update({
        email: row.email,
        raw: mergeRaw(match.raw, {
          email_source: "csv_import",
          email_enriched_at: new Date().toISOString(),
        }),
      })
      .eq("id", match.id);
    if (upErr) throw upErr;
    updated++;
  }

  if (updated > 0) {
    revalidatePath(
      `/clients/${project.client_id}/projects/${projectId}/shortlist`,
    );
  }

  return { updated, alreadyHadEmail, unmatched };
}
