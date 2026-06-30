import { describe, expect, it } from "vitest";
import {
  buildEnrichmentCsv,
  parseCsv,
  parseEnrichmentCsv,
  normalizeLinkedinUrl,
  canonicalLinkedinUrl,
  detectEmailColumn,
} from "@/lib/enrichment/csv";

describe("buildEnrichmentCsv", () => {
  it("writes a header + a blank email column and quotes risky cells", () => {
    const csv = buildEnrichmentCsv([
      { id: "c1", name: "Ada Lovelace", linkedin: "https://linkedin.com/in/ada" },
      { id: "c2", name: 'Grace, "Amazing" Hopper', linkedin: null },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("calyflow_id,name,linkedin_url,email");
    expect(lines[1]).toBe("c1,Ada Lovelace,https://linkedin.com/in/ada,");
    // Comma + embedded quotes → field is quoted and quotes doubled.
    expect(lines[2]).toBe('c2,"Grace, ""Amazing"" Hopper",,');
  });
});

describe("parseCsv", () => {
  it("handles quoted fields, escaped quotes, and CRLF", () => {
    const table = parseCsv('a,b\r\n"x,y","he said ""hi"""\r\n');
    expect(table).toEqual([
      ["a", "b"],
      ["x,y", 'he said "hi"'],
    ]);
  });
});

describe("detectEmailColumn", () => {
  it("prefers a work email over a generic or personal one", () => {
    expect(
      detectEmailColumn(["Name", "Personal Email", "Work Email", "Phone"]),
    ).toBe(2);
  });
  it("falls back to any email-ish header", () => {
    expect(detectEmailColumn(["full name", "e-mail address"])).toBe(1);
  });
  it("returns -1 when there is no email column", () => {
    expect(detectEmailColumn(["name", "linkedin", "phone"])).toBe(-1);
  });
});

describe("normalizeLinkedinUrl", () => {
  it("strips scheme, www, query, trailing slash and lower-cases", () => {
    expect(
      normalizeLinkedinUrl("HTTPS://www.LinkedIn.com/in/Ada/?utm=x"),
    ).toBe("linkedin.com/in/ada");
  });
  it("returns empty for nullish input", () => {
    expect(normalizeLinkedinUrl(null)).toBe("");
    expect(normalizeLinkedinUrl(undefined)).toBe("");
  });
});

describe("canonicalLinkedinUrl", () => {
  it("adds a trailing slash when missing", () => {
    expect(canonicalLinkedinUrl("https://rs.linkedin.com/in/vl-jednak")).toBe(
      "https://rs.linkedin.com/in/vl-jednak/",
    );
  });
  it("leaves an already-canonical URL unchanged", () => {
    expect(
      canonicalLinkedinUrl("https://www.linkedin.com/in/nemanja-perunicic/"),
    ).toBe("https://www.linkedin.com/in/nemanja-perunicic/");
  });
  it("collapses duplicate trailing slashes to one", () => {
    expect(canonicalLinkedinUrl("https://linkedin.com/in/ada///")).toBe(
      "https://linkedin.com/in/ada/",
    );
  });
  it("keeps the query/fragment after the slash", () => {
    expect(
      canonicalLinkedinUrl("https://linkedin.com/in/ada?utm=x"),
    ).toBe("https://linkedin.com/in/ada/?utm=x");
  });
  it("preserves the scheme and country subdomain, trims whitespace", () => {
    expect(canonicalLinkedinUrl("  http://mk.linkedin.com/in/toshe-nastev  ")).toBe(
      "http://mk.linkedin.com/in/toshe-nastev/",
    );
  });
  it("passes non-LinkedIn URLs through untouched", () => {
    expect(canonicalLinkedinUrl("https://github.com/ada")).toBe(
      "https://github.com/ada",
    );
  });
  it("returns null for empty / nullish input", () => {
    expect(canonicalLinkedinUrl(null)).toBeNull();
    expect(canonicalLinkedinUrl("")).toBeNull();
    expect(canonicalLinkedinUrl("   ")).toBeNull();
  });
});

describe("parseEnrichmentCsv", () => {
  it("extracts valid emails and maps id/linkedin/name from sniffed columns", () => {
    const csv = [
      "calyflow_id,name,linkedin_url,email",
      "c1,Ada Lovelace,https://linkedin.com/in/ada,ada@analytical.org",
      "c2,Grace Hopper,https://linkedin.com/in/grace,", // no email → skipped
      "c3,Alan Turing,https://linkedin.com/in/alan,not-an-email", // invalid → skipped
    ].join("\n");
    const { rows, hasEmailColumn, totalRows } = parseEnrichmentCsv(csv);
    expect(hasEmailColumn).toBe(true);
    expect(totalRows).toBe(3);
    expect(rows).toEqual([
      {
        id: "c1",
        name: "Ada Lovelace",
        linkedin: "https://linkedin.com/in/ada",
        email: "ada@analytical.org",
      },
    ]);
  });

  it("works with a foreign tool's headers (no calyflow_id column)", () => {
    const csv = [
      "Full Name,LinkedIn URL,Work Email,Phone",
      "Ada Lovelace,https://linkedin.com/in/ada,ada@work.com,123",
    ].join("\n");
    const { rows } = parseEnrichmentCsv(csv);
    expect(rows[0]).toEqual({
      id: null,
      name: "Ada Lovelace",
      linkedin: "https://linkedin.com/in/ada",
      email: "ada@work.com",
    });
  });

  it("flags a missing email column", () => {
    const { hasEmailColumn, rows } = parseEnrichmentCsv(
      "name,linkedin\nAda,https://linkedin.com/in/ada",
    );
    expect(hasEmailColumn).toBe(false);
    expect(rows).toEqual([]);
  });
});
