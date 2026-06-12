import "server-only";
import type { ConnectorAdapter } from "./types";

// monday.com work OS (GraphQL API). Auth is a personal V2 API token (monday:
// profile picture → Developers → API token) sent raw in the Authorization
// header against a single GraphQL endpoint. Reads are boards and a board's
// items via items_page, whose cursor pages through large boards (querying a
// board's full item list directly isn't allowed). Boards are spreadsheets in
// spirit: columns vary per board, so item tables are built dynamically from
// each item's column_values (column titles come nested under column.title).
// GraphQL reports failures as 200s with an errors array, so both paths are
// checked.
const API = "https://api.monday.com/v2";

const DEFAULT_LIMIT = 25;
const HARD_LIMIT = 100;
const MAX_COLUMNS = 8;
const CHAR_CAP = 12_000;

export interface MondayBoard {
  id?: string;
  name?: string | null;
  board_kind?: string | null;
  items_count?: number | null;
  workspace?: { name?: string | null } | null;
}

export interface MondayItem {
  id?: string;
  name?: string | null;
  group?: { title?: string | null } | null;
  column_values?:
    | { text?: string | null; column?: { title?: string | null } | null }[]
    | null;
}

export interface MondayAdapter extends ConnectorAdapter {
  listBoards(
    apiKey: string,
    args?: { limit?: number; page?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  listItems(
    apiKey: string,
    args: { boardId: string; cursor?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
}

async function gql<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json().catch(() => null)) as {
    data?: T;
    errors?: { message?: string }[];
    error_message?: string;
  } | null;
  if (!res.ok || json?.errors?.length || json?.error_message) {
    const detail =
      json?.errors?.[0]?.message ?? json?.error_message ?? res.statusText;
    throw new Error(`monday.com error (${res.status}): ${detail}`);
  }
  if (!json?.data) throw new Error("monday.com returned no data.");
  return json.data;
}

function cell(s: unknown): string {
  if (s == null) return "";
  return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export const mondayAdapter: MondayAdapter = {
  provider: "monday",
  authType: "apikey",

  async validateApiKey(apiKey) {
    try {
      const data = await gql<{ me?: { name?: string | null; email?: string | null } }>(
        apiKey,
        "query { me { name email } }",
        {},
      );
      const label = data.me?.email ?? data.me?.name;
      return {
        ok: true,
        accountLabel: label ? `monday.com (${label})` : "monday.com",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async listBoards(apiKey, args) {
    const limit = Math.min(args?.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const data = await gql<{ boards?: MondayBoard[] }>(
      apiKey,
      `query ($limit: Int, $page: Int) {
        boards(limit: $limit, page: $page, order_by: used_at) {
          id name board_kind items_count workspace { name }
        }
      }`,
      { limit, page: args?.page ?? 1 },
    );
    const boards = data.boards ?? [];
    if (!boards.length) {
      return { text: "_No boards found._", count: 0, truncated: false };
    }
    const lines = [
      "| Board | Workspace | Kind | Items | Board ID |",
      "| --- | --- | --- | --- | --- |",
    ];
    let truncated = false;
    for (const b of boards) {
      lines.push(
        `| ${cell(b.name)} | ${cell(b.workspace?.name)} | ${cell(
          b.board_kind,
        )} | ${b.items_count ?? ""} | ${cell(b.id)} |`,
      );
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    return {
      text: `${lines.join("\n")}\n\n_Sorted by recent use — a full page means more may follow (page with page)._`,
      count: boards.length,
      truncated: truncated || boards.length >= limit,
    };
  },

  async listItems(apiKey, args) {
    const limit = Math.min(args.limit ?? DEFAULT_LIMIT, HARD_LIMIT);
    const data = await gql<{
      boards?: {
        name?: string | null;
        items_page?: { cursor?: string | null; items?: MondayItem[] } | null;
      }[];
    }>(
      apiKey,
      `query ($boardId: [ID!], $limit: Int, $cursor: String) {
        boards(ids: $boardId) {
          name
          items_page(limit: $limit, cursor: $cursor) {
            cursor
            items {
              id name group { title }
              column_values { text column { title } }
            }
          }
        }
      }`,
      { boardId: [args.boardId], limit, cursor: args.cursor },
    );
    const board = data.boards?.[0];
    if (!board) {
      return { text: "No board found with that id.", count: 0, truncated: false };
    }
    const items = board.items_page?.items ?? [];
    if (!items.length) {
      return { text: "_No items on this board._", count: 0, truncated: false };
    }
    // Columns vary per board — build the table header from the first item.
    const columns = (items[0].column_values ?? [])
      .map((cv) => cv.column?.title ?? "")
      .filter(Boolean)
      .slice(0, MAX_COLUMNS);
    const header = ["Item", ...columns, "Group", "Item ID"];
    const lines = [
      `| ${header.join(" | ")} |`,
      `| ${header.map(() => "---").join(" | ")} |`,
    ];
    let truncated = false;
    for (const item of items) {
      const byTitle = new Map(
        (item.column_values ?? []).map((cv) => [cv.column?.title ?? "", cv.text]),
      );
      const row = [
        cell(item.name),
        ...columns.map((c) => cell(byTitle.get(c))),
        cell(item.group?.title),
        cell(item.id),
      ];
      lines.push(`| ${row.join(" | ")} |`);
      if (lines.join("\n").length > CHAR_CAP) {
        truncated = true;
        break;
      }
    }
    const cursor = board.items_page?.cursor;
    const notes = [
      (items[0].column_values ?? []).length > MAX_COLUMNS
        ? `_Showing the first ${MAX_COLUMNS} columns._`
        : "",
      cursor ? `_More items — pass cursor: ${cursor}_` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      text: `**${board.name ?? "Board"}**\n${lines.join("\n")}${notes ? `\n\n${notes}` : ""}`,
      count: items.length,
      truncated: truncated || !!cursor,
    };
  },
};
