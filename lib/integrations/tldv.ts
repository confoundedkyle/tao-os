import "server-only";
import type { ConnectorAdapter } from "./types";

// tl;dv meeting notetaker. Auth is an API key (tl;dv: personal settings →
// API Keys; the API requires their Business plan) sent as an x-api-key
// header. Reads are the meetings list (page/pages/total envelope), one
// meeting's speaker-attributed transcript, and its AI notes — the notes
// endpoint supersedes the deprecated /highlights and returns markdown plus
// per-topic summaries.
const API = "https://pasta.tldv.io/v1alpha1";

const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 50;
const CHAR_CAP = 12_000;

export interface TldvMeeting {
  id?: string;
  name?: string | null;
  happenedAt?: string | null;
  duration?: number | null;
  organizer?: { name?: string | null; email?: string | null } | null;
  invitees?: { name?: string | null; email?: string | null }[] | null;
}

export interface TldvAdapter extends ConnectorAdapter {
  listMeetings(
    apiKey: string,
    args?: { query?: string; page?: number; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  getTranscript(
    apiKey: string,
    meetingId: string,
  ): Promise<{ text: string; found: boolean; truncated: boolean }>;
  getNotes(
    apiKey: string,
    meetingId: string,
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
    headers: { "x-api-key": apiKey, Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ??
      (json as { error?: string } | null)?.error ??
      res.statusText;
    throw new Error(`tl;dv error (${res.status}): ${detail}`);
  }
  return json as T;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function minutes(seconds?: number | null): string {
  if (!seconds) return "";
  return `${Math.round(seconds / 60)} min`;
}

export const tldvAdapter: TldvAdapter = {
  provider: "tldv",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      await get<unknown>(apiKey, "/meetings", { limit: 1 });
      return { ok: true, accountLabel: "tl;dv" };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listMeetings(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const json = await get<{
      total?: number;
      page?: number;
      pages?: number;
      results?: TldvMeeting[];
    }>(apiKey, "/meetings", {
      query: args?.query,
      page: args?.page,
      limit,
    });
    const meetings = json.results ?? [];
    const lines = [
      "| Meeting | Date | Duration | Organizer | Invitees | Meeting ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const m of meetings) {
      const invitees = (m.invitees ?? [])
        .map((i) => i.email ?? i.name ?? "")
        .filter(Boolean)
        .slice(0, 5)
        .join("; ");
      lines.push(
        `| ${cell(m.name)} | ${cell(m.happenedAt?.slice(0, 10))} | ${minutes(
          m.duration,
        )} | ${cell(m.organizer?.email ?? m.organizer?.name)} | ${cell(
          invitees,
        )} | ${cell(m.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const total = json.total ?? meetings.length;
    return {
      text: meetings.length
        ? `${lines.join("\n")}\n\n_${total} total meetings — page with page._`
        : "_No meetings._",
      count: meetings.length,
      truncated: truncated || total > meetings.length,
    };
  },

  async getTranscript(apiKey, meetingId) {
    const json = await get<{
      data?: { speaker?: string | null; text?: string | null }[];
    }>(apiKey, `/meetings/${encodeURIComponent(meetingId)}/transcript`);
    const entries = json.data ?? [];
    if (!entries.length) {
      return {
        text: "No transcript available for that meeting.",
        found: false,
        truncated: false,
      };
    }
    const lines: string[] = [];
    let truncated = false;
    for (const e of entries) {
      lines.push(`${e.speaker ?? "Unknown"}: ${e.text ?? ""}`);
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        lines.push("…(transcript truncated)");
        break;
      }
    }
    return { text: lines.join("\n"), found: true, truncated };
  },

  async getNotes(apiKey, meetingId) {
    const json = await get<{
      markdownContent?: string | null;
      topics?: { title?: string | null; summary?: string | null }[];
      structuredNotes?: { text?: string | null }[];
    }>(apiKey, `/meetings/${encodeURIComponent(meetingId)}/notes`);
    let text = json.markdownContent ?? "";
    if (!text) {
      const parts: string[] = [];
      for (const t of json.topics ?? []) {
        parts.push(`## ${t.title ?? "Topic"}\n${t.summary ?? ""}`);
      }
      if (!parts.length) {
        const noteLines = (json.structuredNotes ?? [])
          .map((n) => n.text)
          .filter(Boolean);
        if (noteLines.length) parts.push(noteLines.join("\n"));
      }
      text = parts.join("\n\n");
    }
    if (!text) {
      return {
        text: "No notes available for that meeting.",
        found: false,
        truncated: false,
      };
    }
    const truncated = text.length > CHAR_CAP;
    return {
      text: truncated ? `${text.slice(0, CHAR_CAP)}\n…(notes truncated)` : text,
      found: true,
      truncated,
    };
  },
};
