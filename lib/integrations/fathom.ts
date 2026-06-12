import "server-only";
import type { ConnectorAdapter } from "./types";

// Fathom meeting notetaker (public API). Auth is an API key (Fathom:
// Settings → API) sent as an X-Api-Key header. The meetings list filters by
// invitee company domain / recorder email / ISO dates and pages with a
// cursor; the AI summary (markdown) and the speaker-attributed transcript
// hang off a separate per-recording id. The recording id field has shifted
// across API revisions (recording_id vs id), so both are read.
const API = "https://api.fathom.ai/external/v1";

const DEFAULT_LIMIT = 20;
const CHAR_CAP = 12_000;

export interface FathomMeeting {
  recording_id?: number | string;
  id?: number | string;
  title?: string | null;
  meeting_title?: string | null;
  url?: string | null;
  share_url?: string | null;
  created_at?: string | null;
  recording_start_time?: string | null;
  calendar_invitees?:
    | { name?: string | null; email?: string | null }[]
    | null;
}

interface FathomTranscriptEntry {
  speaker?: {
    display_name?: string | null;
    matched_calendar_invitee_email?: string | null;
  } | null;
  text?: string | null;
}

export interface FathomAdapter extends ConnectorAdapter {
  listMeetings(
    apiKey: string,
    args?: {
      inviteeDomain?: string;
      recordedBy?: string;
      createdAfter?: string;
      createdBefore?: string;
      cursor?: string;
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  getSummary(
    apiKey: string,
    recordingId: string,
  ): Promise<{ text: string; found: boolean }>;
  getTranscript(
    apiKey: string,
    recordingId: string,
  ): Promise<{ text: string; found: boolean; truncated: boolean }>;
}

async function get<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<T> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {}))
    if (v !== undefined && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  const res = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ??
      (json as { error?: string } | null)?.error ??
      res.statusText;
    throw new Error(`Fathom error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function meetingId(m: FathomMeeting): string {
  return String(m.recording_id ?? m.id ?? "");
}

export const fathomAdapter: FathomAdapter = {
  provider: "fathom",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await get<unknown>(apiKey, "/meetings", { limit: 1 });
      return { ok: true, accountLabel: "Fathom" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listMeetings(apiKey, args) {
    const limit = args?.limit ?? DEFAULT_LIMIT;
    const params: Record<string, string | number | undefined> = {
      limit,
      created_after: args?.createdAfter,
      created_before: args?.createdBefore,
      cursor: args?.cursor,
    };
    if (args?.inviteeDomain)
      params["calendar_invitees_domains[]"] = args.inviteeDomain;
    if (args?.recordedBy) params["recorded_by[]"] = args.recordedBy;
    const json = await get<{
      items?: FathomMeeting[];
      next_cursor?: string | null;
    }>(apiKey, "/meetings", params);
    const meetings = json.items ?? [];
    const lines = [
      "| Meeting | Date | Invitees | Recording ID | Link |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const m of meetings) {
      const invitees = (m.calendar_invitees ?? [])
        .map((i) => i.email ?? i.name ?? "")
        .filter(Boolean)
        .slice(0, 5)
        .join("; ");
      lines.push(
        `| ${cell(m.title ?? m.meeting_title)} | ${cell(
          (m.recording_start_time ?? m.created_at ?? "").slice(0, 10),
        )} | ${cell(invitees)} | ${cell(meetingId(m))} | ${cell(
          m.share_url ?? m.url,
        )} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const more = !!json.next_cursor;
    return {
      text: meetings.length
        ? `${lines.join("\n")}${more ? `\n\n_More available — pass cursor: ${json.next_cursor}_` : ""}`
        : "_No meetings._",
      count: meetings.length,
      truncated: truncated || more,
    };
  },

  async getSummary(apiKey, recordingId) {
    const json = await get<{
      summary?: { template_name?: string | null; markdown_formatted?: string | null };
    }>(apiKey, `/recordings/${encodeURIComponent(recordingId)}/summary`);
    const md = json.summary?.markdown_formatted;
    if (!md) return { text: "No summary available for that recording.", found: false };
    return {
      text: md.length > CHAR_CAP ? `${md.slice(0, CHAR_CAP)}\n…(summary truncated)` : md,
      found: true,
    };
  },

  async getTranscript(apiKey, recordingId) {
    const json = await get<
      | { items?: FathomTranscriptEntry[] }
      | { transcript?: FathomTranscriptEntry[] }
      | FathomTranscriptEntry[]
    >(apiKey, `/recordings/${encodeURIComponent(recordingId)}/transcript`);
    const entries = Array.isArray(json)
      ? json
      : ((json as { items?: FathomTranscriptEntry[] }).items ??
        (json as { transcript?: FathomTranscriptEntry[] }).transcript ??
        []);
    if (!entries.length) {
      return {
        text: "No transcript available for that recording.",
        found: false,
        truncated: false,
      };
    }
    const lines: string[] = [];
    let truncated = false;
    for (const e of entries) {
      lines.push(`${e.speaker?.display_name ?? "Unknown"}: ${e.text ?? ""}`);
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        lines.push("…(transcript truncated)");
        break;
      }
    }
    return { text: lines.join("\n"), found: true, truncated };
  },
};
