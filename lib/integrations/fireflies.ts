import "server-only";
import type { ConnectorAdapter } from "./types";

// Fireflies.ai meeting notetaker. Auth is an API key (app.fireflies.ai →
// Integrations → Fireflies API) sent as a Bearer header against a single
// GraphQL endpoint. Reads are the transcripts list (keyword / participant /
// date filters, limit max 50) and one transcript's AI summary + sentences.
// GraphQL reports failures as 200s with an errors array, so both paths are
// checked. Meeting dates arrive as epoch milliseconds.
const API = "https://api.fireflies.ai/graphql";

const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 50; // Fireflies transcripts-query max
const CHAR_CAP = 12_000;

export interface FirefliesMeeting {
  id?: string;
  title?: string | null;
  date?: number | null;
  duration?: number | null;
  organizer_email?: string | null;
  participants?: string[] | null;
}

export interface FirefliesTranscript extends FirefliesMeeting {
  summary?: {
    overview?: string | null;
    action_items?: string | null;
    keywords?: string[] | null;
  } | null;
  sentences?: { speaker_name?: string | null; text?: string | null }[] | null;
}

export interface FirefliesAdapter extends ConnectorAdapter {
  listMeetings(
    apiKey: string,
    args?: {
      keyword?: string;
      participantEmail?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  getMeeting(
    apiKey: string,
    args: { meetingId: string },
  ): Promise<{ text: string; found: boolean; truncated: boolean }>;
}

async function gql<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json().catch(() => null)) as {
    data?: T;
    errors?: { message?: string }[];
  } | null;
  if (!res.ok || json?.errors?.length) {
    const detail = json?.errors?.[0]?.message ?? res.statusText;
    throw new Error(`Fireflies error (${res.status}): ${detail}`);
  }
  if (!json?.data) throw new Error("Fireflies returned no data.");
  return json.data;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function meetingDate(ms?: number | null): string {
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

function minutes(seconds?: number | null): string {
  if (!seconds) return "";
  return `${Math.round(seconds / 60)} min`;
}

export const firefliesAdapter: FirefliesAdapter = {
  provider: "fireflies",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const data = await gql<{ users?: { name?: string | null }[] }>(
        apiKey,
        "query { users { name } }",
        {},
      );
      const name = data.users?.[0]?.name;
      return {
        ok: true,
        accountLabel: name ? `Fireflies (${name})` : "Fireflies",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listMeetings(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const data = await gql<{ transcripts?: FirefliesMeeting[] }>(
      apiKey,
      `query Transcripts($limit: Int, $keyword: String, $participants: [String!], $fromDate: DateTime, $toDate: DateTime) {
        transcripts(limit: $limit, keyword: $keyword, participants: $participants, fromDate: $fromDate, toDate: $toDate) {
          id title date duration organizer_email participants
        }
      }`,
      {
        limit,
        keyword: args?.keyword || undefined,
        participants: args?.participantEmail ? [args.participantEmail] : undefined,
        fromDate: args?.fromDate || undefined,
        toDate: args?.toDate || undefined,
      },
    );
    const meetings = data.transcripts ?? [];
    const lines = [
      "| Meeting | Date | Duration | Organizer | Participants | Meeting ID |",
      "| --- | --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const m of meetings) {
      lines.push(
        `| ${cell(m.title)} | ${meetingDate(m.date)} | ${minutes(
          m.duration,
        )} | ${cell(m.organizer_email)} | ${cell(
          (m.participants ?? []).slice(0, 5).join("; "),
        )} | ${cell(m.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: meetings.length ? lines.join("\n") : "_No meetings._",
      count: meetings.length,
      truncated: truncated || meetings.length === limit,
    };
  },

  async getMeeting(apiKey, args) {
    const data = await gql<{ transcript?: FirefliesTranscript | null }>(
      apiKey,
      `query Transcript($id: String!) {
        transcript(id: $id) {
          id title date duration organizer_email participants
          summary { overview action_items keywords }
          sentences { speaker_name text }
        }
      }`,
      { id: args.meetingId },
    );
    const t = data.transcript;
    if (!t) {
      return { text: "No meeting found for that id.", found: false, truncated: false };
    }
    const parts: string[] = [
      `# ${t.title ?? "Untitled meeting"}`,
      [
        meetingDate(t.date),
        minutes(t.duration),
        t.organizer_email ? `organized by ${t.organizer_email}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    ];
    if (t.participants?.length)
      parts.push(`Participants: ${t.participants.join(", ")}`);
    if (t.summary?.overview) parts.push(`## Overview\n${t.summary.overview}`);
    if (t.summary?.action_items)
      parts.push(`## Action items\n${t.summary.action_items}`);
    if (t.summary?.keywords?.length)
      parts.push(`Keywords: ${t.summary.keywords.join(", ")}`);
    let truncated = false;
    const sentences = t.sentences ?? [];
    if (sentences.length) {
      const lines: string[] = ["## Transcript"];
      const budget = CHAR_CAP - parts.join("\n\n").length;
      for (const s of sentences) {
        lines.push(`${s.speaker_name ?? "Unknown"}: ${s.text ?? ""}`);
        if (lines.join("\n").length > budget) {
          truncated = true;
          lines.push("…(transcript truncated)");
          break;
        }
      }
      parts.push(lines.join("\n"));
    }
    return { text: parts.join("\n\n"), found: true, truncated };
  },
};
