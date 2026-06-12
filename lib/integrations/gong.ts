import "server-only";
import type { ConnectorAdapter } from "./types";

// Gong call intelligence (public API v2). Auth is an access-key pair (Gong:
// company settings → Ecosystem → API) pasted as "access-key:secret" and sent
// as HTTP Basic auth. Calls list by an ISO date window and page with a
// cursor; the AI brief/outline/key points and the speaker-attributed
// transcript hang off per-call ids via POST endpoints. Transcripts identify
// speakers only by speakerId, so the transcript op also fetches the call's
// parties to resolve names. AI content (brief, key points) is only present
// when the customer's Gong plan has smart features enabled.
const API = "https://api.gong.io/v2";

const DEFAULT_LIMIT = 20;
const CHAR_CAP = 12_000;
const DEFAULT_WINDOW_DAYS = 30;

interface GongCallMeta {
  id?: string | null;
  title?: string | null;
  started?: string | null;
  duration?: number | null;
  direction?: string | null;
  url?: string | null;
}

interface GongParty {
  speakerId?: string | null;
  name?: string | null;
  emailAddress?: string | null;
  title?: string | null;
  affiliation?: string | null;
}

interface GongExtensiveCall {
  metaData?: GongCallMeta | null;
  parties?: GongParty[] | null;
  content?: {
    brief?: string | null;
    outline?:
      | {
          section?: string | null;
          items?: { text?: string | null }[] | null;
        }[]
      | null;
    keyPoints?: { text?: string | null }[] | null;
  } | null;
}

interface GongTranscriptMonologue {
  speakerId?: string | null;
  topic?: string | null;
  sentences?: { text?: string | null }[] | null;
}

export interface GongAdapter extends ConnectorAdapter {
  listCalls(
    apiKey: string,
    args?: {
      fromDate?: string;
      toDate?: string;
      cursor?: string;
      limit?: number;
    },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  getSummary(
    apiKey: string,
    callId: string,
  ): Promise<{ text: string; found: boolean }>;
  getTranscript(
    apiKey: string,
    callId: string,
  ): Promise<{ text: string; found: boolean; truncated: boolean }>;
}

function headers(apiKey: string): Record<string, string> {
  // The pasted key is "access-key:secret" — exactly what Basic auth encodes.
  return {
    Authorization: `Basic ${Buffer.from(apiKey).toString("base64")}`,
    Accept: "application/json",
  };
}

function fail(res: Response, json: unknown): never {
  const errors = (json as { errors?: string[] } | null)?.errors;
  const detail = errors?.length ? errors.join("; ") : res.statusText;
  throw new Error(`Gong error (${res.status}): ${detail}`);
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function minutes(seconds?: number | null): string {
  if (seconds == null) return "";
  return `${Math.round(seconds / 60)} min`;
}

function isoDay(s?: string | null): string {
  return (s ?? "").slice(0, 10);
}

async function fetchExtensive(
  apiKey: string,
  callId: string,
  content: boolean,
): Promise<GongExtensiveCall | null> {
  const res = await fetch(`${API}/calls/extensive`, {
    method: "POST",
    headers: { ...headers(apiKey), "Content-Type": "application/json" },
    body: JSON.stringify({
      filter: { callIds: [callId] },
      contentSelector: {
        exposedFields: {
          parties: true,
          ...(content
            ? { content: { brief: true, outline: true, keyPoints: true } }
            : {}),
        },
      },
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    calls?: GongExtensiveCall[];
  } | null;
  // Gong reports an empty result set as 404 rather than an empty list.
  if (res.status === 404) return null;
  if (!res.ok) fail(res, json);
  return json?.calls?.[0] ?? null;
}

export const gongAdapter: GongAdapter = {
  provider: "gong",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const res = await fetch(`${API}/users`, { headers: headers(apiKey) });
      const json = (await res.json().catch(() => null)) as {
        users?: { emailAddress?: string | null }[];
      } | null;
      if (!res.ok) fail(res, json);
      const domain = json?.users?.[0]?.emailAddress?.split("@")[1];
      return {
        ok: true,
        accountLabel: domain ? `Gong (${domain})` : "Gong",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listCalls(apiKey, args) {
    const to = args?.toDate ? new Date(args.toDate) : new Date();
    const from = args?.fromDate
      ? new Date(args.fromDate)
      : new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const sp = new URLSearchParams({
      fromDateTime: from.toISOString(),
      toDateTime: to.toISOString(),
    });
    if (args?.cursor) sp.set("cursor", args.cursor);
    const res = await fetch(`${API}/calls?${sp.toString()}`, {
      headers: headers(apiKey),
    });
    const json = (await res.json().catch(() => null)) as {
      calls?: GongCallMeta[];
      records?: { totalRecords?: number; cursor?: string | null };
    } | null;
    if (res.status === 404) {
      return { text: "_No calls in that date range._", count: 0, truncated: false };
    }
    if (!res.ok) fail(res, json);
    const limit = args?.limit ?? DEFAULT_LIMIT;
    const calls = (json?.calls ?? []).slice(0, limit);
    const lines = [
      "| Call | Date | Duration | Direction | Call ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const c of calls) {
      lines.push(
        `| ${cell(c.title)} | ${cell(isoDay(c.started))} | ${cell(
          minutes(c.duration),
        )} | ${cell(c.direction)} | ${cell(c.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const total = json?.records?.totalRecords ?? calls.length;
    const cursor = json?.records?.cursor;
    return {
      text: calls.length
        ? `${lines.join("\n")}\n\n_${total} calls in range._${cursor ? ` _More available — pass cursor: ${cursor}_` : ""}`
        : "_No calls in that date range._",
      count: calls.length,
      truncated: truncated || !!cursor || total > calls.length,
    };
  },

  async getSummary(apiKey, callId) {
    const call = await fetchExtensive(apiKey, callId, true);
    if (!call) return { text: "No call found with that id.", found: false };
    const meta = call.metaData ?? {};
    const parties = (call.parties ?? [])
      .map((p) => {
        const who = [p.name ?? p.emailAddress ?? "Unknown", p.title]
          .filter(Boolean)
          .join(", ");
        return `${who}${p.affiliation ? ` (${p.affiliation.toLowerCase()})` : ""}`;
      })
      .join("; ");
    const content = call.content ?? {};
    const outline = (content.outline ?? [])
      .map((s) => {
        const items = (s.items ?? [])
          .map((i) => `  - ${i.text ?? ""}`)
          .join("\n");
        return `- **${s.section ?? "Section"}**${items ? `\n${items}` : ""}`;
      })
      .join("\n");
    const keyPoints = (content.keyPoints ?? [])
      .map((k) => `- ${k.text ?? ""}`)
      .join("\n");
    const parts = [
      `**${meta.title ?? "Untitled call"}** — ${isoDay(meta.started)} · ${minutes(meta.duration)}`,
      parties ? `Participants: ${parties}` : null,
      content.brief ? `\n**Brief**\n${content.brief}` : null,
      keyPoints ? `\n**Key points**\n${keyPoints}` : null,
      outline ? `\n**Outline**\n${outline}` : null,
    ].filter(Boolean);
    if (parts.length === 1) {
      parts.push(
        "_No AI summary available — smart features may be off for this call. Use gong_get_transcript instead._",
      );
    }
    const text = parts.join("\n");
    return {
      text: text.length > CHAR_CAP ? `${text.slice(0, CHAR_CAP)}\n…(summary truncated)` : text,
      found: true,
    };
  },

  async getTranscript(apiKey, callId) {
    const [call, res] = await Promise.all([
      fetchExtensive(apiKey, callId, false),
      fetch(`${API}/calls/transcript`, {
        method: "POST",
        headers: { ...headers(apiKey), "Content-Type": "application/json" },
        body: JSON.stringify({ filter: { callIds: [callId] } }),
      }),
    ]);
    const json = (await res.json().catch(() => null)) as {
      callTranscripts?: {
        transcript?: GongTranscriptMonologue[] | null;
      }[];
    } | null;
    if (res.status === 404) {
      return { text: "No transcript available for that call.", found: false, truncated: false };
    }
    if (!res.ok) fail(res, json);
    const monologues = json?.callTranscripts?.[0]?.transcript ?? [];
    if (!monologues.length) {
      return { text: "No transcript available for that call.", found: false, truncated: false };
    }
    const speakers = new Map<string, string>();
    for (const p of call?.parties ?? []) {
      if (p.speakerId)
        speakers.set(p.speakerId, p.name ?? p.emailAddress ?? "Unknown");
    }
    const lines: string[] = [];
    let truncated = false;
    for (const m of monologues) {
      const who = (m.speakerId && speakers.get(m.speakerId)) ?? "Unknown";
      const said = (m.sentences ?? [])
        .map((s) => s.text ?? "")
        .filter(Boolean)
        .join(" ");
      lines.push(`${who}: ${said}`);
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        lines.push("…(transcript truncated)");
        break;
      }
    }
    return { text: lines.join("\n"), found: true, truncated };
  },
};
