import "server-only";
import type { ConnectorAdapter } from "./types";

// GitHub (public code-host data). Auth is a Personal Access Token sent as a
// Bearer header — a classic token with `public_repo`/read scope, or a
// fine-grained token with read-only public access, is plenty. The token raises
// the rate limit and is required by the search API. Used to source engineers:
// find repos in a domain, list the people who contributed to or forked them,
// and pull author emails out of commit metadata (public, for attribution).
const API = "https://api.github.com";
const CHAR_CAP = 12_000;
const DEFAULT_LIMIT = 20;
const HARD_LIMIT = 50;

// Emails GitHub exposes that aren't real contact addresses.
const NON_CONTACT = /(noreply|no-reply)@|@users\.noreply\.github\.com$/i;

interface GhRepo {
  full_name?: string;
  description?: string | null;
  stargazers_count?: number;
  language?: string | null;
  html_url?: string;
}
interface GhUser {
  login?: string;
  contributions?: number;
  html_url?: string;
}
interface GhFork {
  full_name?: string;
  html_url?: string;
  owner?: { login?: string; html_url?: string } | null;
  pushed_at?: string | null;
}
interface GhCommit {
  sha?: string;
  commit?: {
    author?: { name?: string | null; email?: string | null } | null;
  } | null;
  author?: { login?: string | null } | null;
}

export interface GitHubAdapter extends ConnectorAdapter {
  searchRepos(
    token: string,
    args: { query: string; language?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  contributors(
    token: string,
    args: { owner: string; repo: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  forks(
    token: string,
    args: { owner: string; repo: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  commitEmails(
    token: string,
    args: { owner: string; repo: string; author?: string; limit?: number },
  ): Promise<{ text: string; count: number; truncated: boolean }>;
  /** A user's PUBLIC profile email (the one shown on their profile, if they made
   *  it public), plus a few profile fields. Null email when not public. */
  userEmail(
    token: string,
    username: string,
  ): Promise<{
    email: string | null;
    name: string | null;
    company: string | null;
    location: string | null;
    blog: string | null;
  }>;
}

async function gh<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "calyflow-sourcer",
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      (json as { message?: string } | null)?.message ?? res.statusText;
    throw new Error(`GitHub error (${res.status}): ${detail}`);
  }
  return json as T;
}

const cap = (n: number | undefined) =>
  Math.min(n ?? DEFAULT_LIMIT, HARD_LIMIT);

function clamp(blocks: string[]): { text: string; truncated: boolean } {
  const out: string[] = [];
  let truncated = false;
  for (const b of blocks) {
    out.push(b);
    if (out.join("\n").length > CHAR_CAP) {
      truncated = true;
      break;
    }
  }
  return { text: out.join("\n"), truncated };
}

export const githubAdapter: GitHubAdapter = {
  provider: "github",
  authType: "apikey",

  async validateApiKey(token) {
    try {
      const user = await gh<{ login?: string }>(token, "/user");
      return user?.login
        ? { ok: true, accountLabel: `GitHub (@${user.login})` }
        : { ok: false, message: "GitHub rejected the token." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Validation failed",
      };
    }
  },

  async searchRepos(token, args) {
    const limit = cap(args.limit);
    const q = [args.query, args.language ? `language:${args.language}` : ""]
      .filter(Boolean)
      .join(" ");
    const json = await gh<{ total_count?: number; items?: GhRepo[] }>(
      token,
      `/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${limit}`,
    );
    const items = json.items ?? [];
    if (items.length === 0)
      return { text: "_No repositories found._", count: 0, truncated: false };
    const { text, truncated } = clamp(
      items.map(
        (r) =>
          `- **${r.full_name}** ⭐${r.stargazers_count ?? 0}${r.language ? ` · ${r.language}` : ""} — ${r.description ?? ""}`.trim(),
      ),
    );
    return {
      text,
      count: items.length,
      truncated: truncated || (json.total_count ?? 0) > items.length,
    };
  },

  async contributors(token, args) {
    const limit = cap(args.limit);
    const users = await gh<GhUser[]>(
      token,
      `/repos/${args.owner}/${args.repo}/contributors?per_page=${limit}`,
    );
    if (!Array.isArray(users) || users.length === 0)
      return { text: "_No contributors found._", count: 0, truncated: false };
    const { text, truncated } = clamp(
      users.map(
        (u) =>
          `- **@${u.login}** — ${u.contributions ?? 0} commits · ${u.html_url ?? `https://github.com/${u.login}`}`,
      ),
    );
    return { text, count: users.length, truncated };
  },

  async forks(token, args) {
    const limit = cap(args.limit);
    const forks = await gh<GhFork[]>(
      token,
      `/repos/${args.owner}/${args.repo}/forks?sort=newest&per_page=${limit}`,
    );
    if (!Array.isArray(forks) || forks.length === 0)
      return { text: "_No forks found._", count: 0, truncated: false };
    const { text, truncated } = clamp(
      forks.map((f) => {
        const login = f.owner?.login ?? "";
        const when = f.pushed_at
          ? ` · last push ${f.pushed_at.slice(0, 10)}`
          : "";
        return `- **@${login}** — forked to ${f.full_name}${when} · ${f.owner?.html_url ?? `https://github.com/${login}`}`;
      }),
    );
    return { text, count: forks.length, truncated };
  },

  async commitEmails(token, args) {
    const limit = cap(args.limit);
    const author = args.author
      ? `&author=${encodeURIComponent(args.author)}`
      : "";
    const commits = await gh<GhCommit[]>(
      token,
      `/repos/${args.owner}/${args.repo}/commits?per_page=${limit}${author}`,
    );
    if (!Array.isArray(commits) || commits.length === 0)
      return { text: "_No commits found._", count: 0, truncated: false };
    // Dedupe by email; surface real contact addresses, flag the noreply ones.
    const seen = new Map<string, { name: string; login: string }>();
    for (const c of commits) {
      const email = c.commit?.author?.email ?? "";
      if (!email || seen.has(email)) continue;
      seen.set(email, {
        name: c.commit?.author?.name ?? "",
        login: c.author?.login ?? "",
      });
    }
    const rows = [...seen.entries()]
      .filter(([email]) => !NON_CONTACT.test(email))
      .map(
        ([email, m]) =>
          `- ${m.name || "Unknown"}${m.login ? ` (@${m.login})` : ""} — ${email}`,
      );
    if (rows.length === 0)
      return {
        text: "_Only GitHub noreply emails found — no usable contact address in these commits._",
        count: 0,
        truncated: false,
      };
    const { text, truncated } = clamp(rows);
    return { text, count: rows.length, truncated };
  },

  async userEmail(token, username) {
    const clean = username.trim().replace(/^@/, "");
    const u = await gh<{
      email?: string | null;
      name?: string | null;
      company?: string | null;
      location?: string | null;
      blog?: string | null;
    }>(token, `/users/${encodeURIComponent(clean)}`);
    return {
      email: u?.email?.trim() || null,
      name: u?.name ?? null,
      company: u?.company ?? null,
      location: u?.location ?? null,
      blog: u?.blog?.trim() || null,
    };
  },
};
