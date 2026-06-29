// Parsing + column-mapping for a LinkedIn "Connections.csv" export (and any
// other CSV of contacts, mapped by AI). Pure and dependency-free so it runs in
// the browser (preview) and is fully unit-tested. The actual insert + the AI
// column-mapping LLM call live in the server actions (lib/actions/talent.ts).

import { isValidLinkedinUrl } from "./validation";

/** Canonical talent-prospect fields a CSV column can map to. */
export const PROSPECT_FIELDS = [
  "first_name",
  "last_name",
  "name",
  "email",
  "linkedin_url",
  "company",
  "job_title",
  "connected_on",
  "phone",
  "country",
  "city",
  "notes",
] as const;
export type ProspectField = (typeof PROSPECT_FIELDS)[number];

export function isProspectField(v: unknown): v is ProspectField {
  return typeof v === "string" && (PROSPECT_FIELDS as readonly string[]).includes(v);
}

/** A prospect ready to import, built from one CSV data row. */
export interface ImportProspect {
  name: string;
  email: string | null;
  linkedin_url: string | null;
  company: string | null;
  job_title: string | null;
  connected_on: string | null; // ISO yyyy-mm-dd
  phone: string | null;
  country: string | null;
  city: string | null;
  /** Any columns we couldn't map, kept verbatim under their original header. */
  profile: Record<string, string>;
}

/**
 * Parse CSV text into rows of string cells (RFC-4180-ish: quoted fields,
 * doubled "" escapes, commas/newlines inside quotes, CRLF or LF, BOM stripped).
 */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const isBlankRow = (row: string[]) => row.every((c) => c.trim() === "");
const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

// The exact LinkedIn Connections.csv header → our fields.
const LINKEDIN_HEADER_MAP: Record<string, ProspectField> = {
  "first name": "first_name",
  "last name": "last_name",
  url: "linkedin_url",
  "email address": "email",
  company: "company",
  position: "job_title",
  "connected on": "connected_on",
};

/** Is this row the LinkedIn Connections header? (The export prefixes 2–3 note
 *  rows before it, so we detect the header rather than assuming a fixed offset.) */
export function isLinkedInConnectionsHeader(cells: string[]): boolean {
  const set = new Set(cells.map(normalizeHeader));
  return set.has("first name") && set.has("last name") && set.has("url");
}

export interface DetectedHeader {
  index: number;
  cells: string[];
}

/** Find the header row: the LinkedIn Connections header within the first few
 *  rows (skipping the note rows), else the first non-blank row (generic CSV). */
export function detectHeader(rows: string[][]): DetectedHeader | null {
  const scan = Math.min(rows.length, 8);
  for (let i = 0; i < scan; i++) {
    if (!isBlankRow(rows[i]) && isLinkedInConnectionsHeader(rows[i])) {
      return { index: i, cells: rows[i] };
    }
  }
  for (let i = 0; i < rows.length; i++) {
    if (!isBlankRow(rows[i])) return { index: i, cells: rows[i] };
  }
  return null;
}

/** Column→field mapping for the known LinkedIn header (null = unmapped). */
export function mapKnownColumns(headerCells: string[]): (ProspectField | null)[] {
  return headerCells.map((h) => LINKEDIN_HEADER_MAP[normalizeHeader(h)] ?? null);
}

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

/** Parse LinkedIn's "DD Mon YYYY" (e.g. "18 Jul 2023") — or an ISO date — into
 *  yyyy-mm-dd. Returns null for anything unrecognised (never throws). */
export function parseConnectedOn(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const m = v.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return null;
}

const clean = (v: string | undefined): string | null => {
  const t = (v ?? "").trim();
  return t || null;
};

/**
 * Build importable prospects from CSV data rows and a column→field mapping.
 * Rows with no resolvable name are dropped. Unmapped non-empty columns are kept
 * under their original header in `profile`. Invalid LinkedIn URLs are dropped
 * (the row is still imported) rather than failing the whole import.
 */
export function rowsToProspects(
  dataRows: string[][],
  headerCells: string[],
  mapping: (ProspectField | null)[],
): ImportProspect[] {
  const out: ImportProspect[] = [];
  for (const row of dataRows) {
    if (isBlankRow(row)) continue;
    const f: Partial<Record<ProspectField, string>> = {};
    const profile: Record<string, string> = {};
    headerCells.forEach((header, col) => {
      const value = (row[col] ?? "").trim();
      if (!value) return;
      const field = mapping[col] ?? null;
      if (field) f[field] = value;
      else profile[header.trim() || `column_${col + 1}`] = value;
    });

    const name =
      clean(f.name) ??
      [clean(f.first_name), clean(f.last_name)].filter(Boolean).join(" ").trim();
    if (!name) continue;

    const url = clean(f.linkedin_url);
    out.push({
      name,
      email: clean(f.email),
      linkedin_url: url && isValidLinkedinUrl(url) ? url : null,
      company: clean(f.company),
      job_title: clean(f.job_title),
      connected_on: parseConnectedOn(f.connected_on),
      phone: clean(f.phone),
      country: clean(f.country),
      city: clean(f.city),
      profile,
    });
  }
  return out;
}

/** Coerce an AI-produced mapping (array of field strings / null) to our shape,
 *  aligned to `headerCount`. Unknown values become null. */
export function coerceAiMapping(
  raw: unknown,
  headerCount: number,
): (ProspectField | null)[] {
  const arr = Array.isArray(raw) ? raw : [];
  return Array.from({ length: headerCount }, (_, i) =>
    isProspectField(arr[i]) ? (arr[i] as ProspectField) : null,
  );
}
