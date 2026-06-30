// Pure CSV helpers for the Shortlist email-enrichment round-trip: export the
// candidates that still need an email (with their LinkedIn URLs) to a CSV the
// recruiter runs through ContactOut / Hunter / similar, then import the enriched
// file back. No server-only imports — these run in the browser (download +
// parse) and on the server (import action), so both agree on the format.

/** One row of the exported "needs email" CSV. */
export interface EnrichmentExportRow {
  id: string;
  name: string | null;
  linkedin: string | null;
}

/** One usable row parsed back from an enriched CSV. */
export interface EnrichmentImportRow {
  /** Our candidate id, if the enrichment tool preserved the column. */
  id: string | null;
  /** The LinkedIn URL the email belongs to (normalized for matching). */
  linkedin: string | null;
  email: string;
  name: string | null;
}

const EXPORT_HEADERS = ["calyflow_id", "name", "linkedin_url", "email"] as const;

function csvCell(value: string): string {
  const s = value ?? "";
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build the CSV the recruiter downloads. The `email` column is left blank for
 *  the enrichment tool to fill; `calyflow_id` lets us match the file back exactly
 *  even if the LinkedIn URL gets reformatted. */
export function buildEnrichmentCsv(rows: EnrichmentExportRow[]): string {
  const lines = [EXPORT_HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.id, r.name ?? "", r.linkedin ?? "", ""].map(csvCell).join(","),
    );
  }
  return lines.join("\r\n");
}

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes
 *  (`""`), and both `\n` and `\r\n` line endings. Returns a table of rows. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAny = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      sawAny = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
      sawAny = true;
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      sawAny = false;
    } else if (c === "\r") {
      // swallow — the following \n closes the line
    } else {
      field += c;
      sawAny = true;
    }
  }
  // Flush a trailing field/row that wasn't terminated by a newline.
  if (sawAny || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Index of the first header matching any of `patterns` (lower-cased, trimmed). */
function detectColumn(headers: string[], patterns: RegExp[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const p of patterns) {
    const i = norm.findIndex((h) => p.test(h));
    if (i !== -1) return i;
  }
  return -1;
}

/** Pick the best email column: prefer a work/business email, then a plain
 *  "email", then a personal one — so we save the most outreach-appropriate
 *  address regardless of how the tool labelled its columns. */
export function detectEmailColumn(headers: string[]): number {
  return detectColumn(headers, [
    /work.*e-?mail|business.*e-?mail/,
    /^e-?mail$|email.*address|^e-?mail\b/,
    /e-?mail/,
  ]);
}

export function detectLinkedinColumn(headers: string[]): number {
  return detectColumn(headers, [/linkedin/, /profile.*url|profile$/, /\burl\b/]);
}

export function detectIdColumn(headers: string[]): number {
  return detectColumn(headers, [/calyflow_?id/, /^id$|candidate.*id/]);
}

function detectNameColumn(headers: string[]): number {
  return detectColumn(headers, [/full.?name/, /^name$/, /name/]);
}

/** Normalize a LinkedIn URL for matching: drop scheme, `www.`, query string,
 *  trailing slash, and lower-case. So the URL we exported matches the one the
 *  tool echoed back even if it was reformatted. */
export function normalizeLinkedinUrl(url: string | null | undefined): string {
  if (!url) return "";
  let s = url.trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split(/[?#]/)[0].replace(/\/+$/, "");
  return s;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ParseEnrichmentResult {
  rows: EnrichmentImportRow[];
  /** False when no email column could be found — surfaced as a clear error. */
  hasEmailColumn: boolean;
  /** Total non-empty data rows seen (for "found N emails of M rows" messaging). */
  totalRows: number;
}

/** Parse an enriched CSV back into usable rows. Tool-agnostic: it sniffs the
 *  email / linkedin / id / name columns by header name, so a ContactOut export,
 *  a Hunter export, or a hand-made sheet all work. Rows without a valid email
 *  are skipped. */
export function parseEnrichmentCsv(text: string): ParseEnrichmentResult {
  const table = parseCsv(text).filter(
    (r) => !(r.length === 1 && r[0].trim() === ""),
  );
  if (table.length < 2) {
    return { rows: [], hasEmailColumn: table.length > 0, totalRows: 0 };
  }
  const headers = table[0];
  const emailCol = detectEmailColumn(headers);
  if (emailCol === -1) {
    return { rows: [], hasEmailColumn: false, totalRows: table.length - 1 };
  }
  const linkedinCol = detectLinkedinColumn(headers);
  const idCol = detectIdColumn(headers);
  const nameCol = detectNameColumn(headers);

  const rows: EnrichmentImportRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const at = (col: number) => (col !== -1 ? (r[col] ?? "").trim() : "");
    const email = at(emailCol);
    if (!email || !EMAIL_RE.test(email)) continue;
    rows.push({
      id: at(idCol) || null,
      linkedin: at(linkedinCol) || null,
      email,
      name: at(nameCol) || null,
    });
  }
  return { rows, hasEmailColumn: true, totalRows: table.length - 1 };
}
