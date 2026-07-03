import { describe, expect, it } from "vitest";
import {
  coerceAiMapping,
  detectDelimiter,
  detectHeader,
  isLinkedInConnectionsHeader,
  mapKnownColumns,
  parseConnectedOn,
  parseCsv,
  rowsToProspects,
} from "@/lib/linkedin-csv";

describe("detectDelimiter (semicolon / tab support)", () => {
  it("detects comma, semicolon, and tab from the first non-empty line", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });
  it("ignores delimiters inside quotes and defaults to comma on a tie", () => {
    expect(detectDelimiter('"a;b",c\n1,2')).toBe(",");
    expect(detectDelimiter("only-one-column")).toBe(",");
  });
  it("parses a semicolon-separated LinkedIn export end-to-end", () => {
    // Mac Numbers / European Excel export semicolons — this used to collapse
    // every row into a single cell and only map first_name.
    const csv =
      "First Name;Last Name;URL;Email Address;Company;Position;Connected On\n" +
      "Tatsiana;Marozka;https://www.linkedin.com/in/tatiana-morozko;;TM Recruiting;Professional Recruiter;19 Oct 2019";
    const rows = parseCsv(csv);
    expect(rows[0]).toHaveLength(7);
    const header = detectHeader(rows)!;
    expect(isLinkedInConnectionsHeader(header.cells)).toBe(true);
    const prospects = rowsToProspects(
      rows.slice(header.index + 1),
      header.cells,
      mapKnownColumns(header.cells),
    );
    expect(prospects[0]).toMatchObject({
      name: "Tatsiana Marozka",
      company: "TM Recruiting",
      job_title: "Professional Recruiter",
      linkedin_url: "https://www.linkedin.com/in/tatiana-morozko",
      connected_on: "2019-10-19",
    });
  });
});

describe("parseCsv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted commas, doubled-quote escapes, CRLF and a BOM", () => {
    const csv = '﻿Name,Note\r\n"Acme, Inc.","He said ""hi"""\r\n';
    expect(parseCsv(csv)).toEqual([
      ["Name", "Note"],
      ["Acme, Inc.", 'He said "hi"'],
    ]);
  });

  it("keeps embedded newlines inside quotes", () => {
    expect(parseCsv('a,"line1\nline2"')).toEqual([["a", "line1\nline2"]]);
  });
});

describe("isLinkedInConnectionsHeader", () => {
  it("recognises the export header regardless of case/spacing", () => {
    expect(
      isLinkedInConnectionsHeader([
        "First Name",
        "Last Name",
        "URL",
        "Email Address",
        "Company",
        "Position",
        "Connected On",
      ]),
    ).toBe(true);
  });
  it("rejects an unrelated header", () => {
    expect(isLinkedInConnectionsHeader(["Full Name", "Email"])).toBe(false);
  });
});

const LINKEDIN_CSV = [
  "Notes:",
  '"When exporting your connection data, you may notice that some of the fields, such as email address, are empty."',
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  'Jane,Doe,https://www.linkedin.com/in/janedoe,jane@acme.com,"Acme, Inc.",Staff Engineer,18 Jul 2023',
  "John,Smith,https://www.linkedin.com/in/johnsmith,,Globex,VP Engineering,02 Jan 2024",
  ",,,,,,",
].join("\n");

describe("detectHeader", () => {
  it("skips the LinkedIn note rows and finds the header at row 3", () => {
    const rows = parseCsv(LINKEDIN_CSV);
    const header = detectHeader(rows);
    expect(header?.index).toBe(2);
    expect(header?.cells[0]).toBe("First Name");
  });

  it("falls back to the first non-blank row for a generic CSV", () => {
    const rows = parseCsv("\n\nFull Name,Mail\nAda,ada@x.com");
    expect(detectHeader(rows)?.index).toBe(2);
  });

  it("returns null for an empty file", () => {
    expect(detectHeader(parseCsv("\n\n"))).toBeNull();
  });
});

describe("parseConnectedOn", () => {
  it('parses "DD Mon YYYY"', () => {
    expect(parseConnectedOn("18 Jul 2023")).toBe("2023-07-18");
    expect(parseConnectedOn("2 Jan 2024")).toBe("2024-01-02");
  });
  it("passes through ISO dates", () => {
    expect(parseConnectedOn("2023-07-18")).toBe("2023-07-18");
  });
  it("returns null for blanks and junk", () => {
    expect(parseConnectedOn("")).toBeNull();
    expect(parseConnectedOn(null)).toBeNull();
    expect(parseConnectedOn("sometime in 2023")).toBeNull();
  });
});

describe("rowsToProspects (LinkedIn export end-to-end)", () => {
  const rows = parseCsv(LINKEDIN_CSV);
  const header = detectHeader(rows)!;
  const mapping = mapKnownColumns(header.cells);
  const prospects = rowsToProspects(rows.slice(header.index + 1), header.cells, mapping);

  it("maps the known columns to a clean prospect", () => {
    expect(prospects).toHaveLength(2); // blank trailing row dropped
    expect(prospects[0]).toEqual({
      name: "Jane Doe",
      email: "jane@acme.com",
      linkedin_url: "https://www.linkedin.com/in/janedoe",
      company: "Acme, Inc.",
      job_title: "Staff Engineer",
      connected_on: "2023-07-18",
      phone: null,
      country: null,
      city: null,
      profile: {},
    });
  });

  it("leaves a missing email null", () => {
    expect(prospects[1].email).toBeNull();
    expect(prospects[1].connected_on).toBe("2024-01-02");
  });
});

describe("rowsToProspects (edge cases)", () => {
  it("drops rows with no resolvable name", () => {
    const header = ["First Name", "Last Name", "URL"];
    const mapping = mapKnownColumns(header);
    const out = rowsToProspects(
      [
        ["", "", "https://linkedin.com/in/x"], // no name → dropped
        ["Ada", "", ""],
      ],
      header,
      mapping,
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Ada");
  });

  it("drops an invalid LinkedIn URL but keeps the row, and stashes unmapped columns in profile", () => {
    const header = ["Full Name", "URL", "Favourite Colour"];
    // AI-style mapping: name, linkedin_url, (unmapped)
    const mapping = ["name", "linkedin_url", null] as const;
    const out = rowsToProspects(
      [["Grace Hopper", "not-a-url", "teal"]],
      header,
      [...mapping],
    );
    expect(out[0].linkedin_url).toBeNull();
    expect(out[0].profile).toEqual({ "Favourite Colour": "teal" });
  });
});

describe("coerceAiMapping", () => {
  it("keeps known fields, nulls unknowns, and aligns to the header count", () => {
    expect(
      coerceAiMapping(["name", "email", "nonsense", "linkedin_url"], 4),
    ).toEqual(["name", "email", null, "linkedin_url"]);
  });
  it("pads/truncates to the header count and tolerates non-arrays", () => {
    expect(coerceAiMapping(["name"], 3)).toEqual(["name", null, null]);
    expect(coerceAiMapping("oops", 2)).toEqual([null, null]);
  });
});
