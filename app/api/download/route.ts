import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  Packer,
  BorderStyle,
} from "docx";

// Minimal markdown → docx converter (handles headings, bullets, tables, bold)
function markdownToDocx(text: string): Paragraph[] {
  const lines = text.split("\n");
  const paragraphs: Paragraph[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Heading
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      paragraphs.push(
        new Paragraph({
          text: headingMatch[2],
          heading:
            level === 1
              ? HeadingLevel.HEADING_1
              : level === 2
                ? HeadingLevel.HEADING_2
                : HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 80 },
        }),
      );
      i++;
      continue;
    }

    // Table: detect by | at start
    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith("|")) {
        if (!lines[i].match(/^\s*\|[\s\-:|]+\|\s*$/)) {
          tableLines.push(lines[i]);
        }
        i++;
      }
      if (tableLines.length > 0) {
        const rows = tableLines.map((tl) =>
          tl
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim()),
        );
        const colCount = Math.max(...rows.map((r) => r.length));
        // 9072 twips = ~16 cm content width (A4 with 1-inch margins)
        const colWidth = Math.floor(9072 / colCount);
        const cellBorders = {
          top: { style: BorderStyle.SINGLE, size: 1 },
          bottom: { style: BorderStyle.SINGLE, size: 1 },
          left: { style: BorderStyle.SINGLE, size: 1 },
          right: { style: BorderStyle.SINGLE, size: 1 },
        };
        paragraphs.push(
          new Table({
            width: { size: 9072, type: WidthType.DXA },
            columnWidths: Array(colCount).fill(colWidth),
            rows: rows.map(
              (cells, ri) =>
                new TableRow({
                  children: Array.from({ length: colCount }, (_, ci) =>
                    new TableCell({
                      width: { size: colWidth, type: WidthType.DXA },
                      children: [
                        new Paragraph({
                          children: ri === 0
                            ? [new TextRun({ text: cells[ci] ?? "", bold: true, size: 20 })]
                            : inlineRuns(cells[ci] ?? ""),
                        }),
                      ],
                      borders: cellBorders,
                    }),
                  ),
                }),
            ),
          }) as unknown as Paragraph,
        );
      }
      continue;
    }

    // Bullet
    const bulletMatch = line.match(/^[\s]*[-*]\s+(.+)/);
    if (bulletMatch) {
      paragraphs.push(
        new Paragraph({
          children: inlineRuns(bulletMatch[1]),
          bullet: { level: 0 },
          spacing: { after: 40 },
        }),
      );
      i++;
      continue;
    }

    // Blank line
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ text: "" }));
      i++;
      continue;
    }

    // Regular paragraph
    paragraphs.push(
      new Paragraph({
        children: inlineRuns(line),
        spacing: { after: 80 },
        alignment: AlignmentType.LEFT,
      }),
    );
    i++;
  }

  return paragraphs;
}

// Handle **bold** and `code` inline
function inlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun({ text: text.slice(last, m.index), size: 22 }));
    if (m[1]) runs.push(new TextRun({ text: m[1], bold: true, size: 22 }));
    if (m[2]) runs.push(new TextRun({ text: m[2], font: "Courier New", size: 20 }));
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(new TextRun({ text: text.slice(last), size: 22 }));
  return runs.length ? runs : [new TextRun({ text, size: 22 })];
}

// Cap on the text we'll turn into a document — large bodies make docx
// generation CPU/memory-heavy, so bound it (1 MB of text is a huge document).
const MAX_TEXT_BYTES = 1024 * 1024;

export async function POST(req: NextRequest) {
  // Authenticated users only — this runs server-side document generation.
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await rateLimit(`download:${session.workspaceId}`, {
    limit: 30,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { text, filename, format } = await req.json();
  if (!text || !format) return NextResponse.json({ error: "Missing params" }, { status: 400 });
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
    return NextResponse.json({ error: "Text too large" }, { status: 413 });
  }

  const safeName = (filename ?? "document")
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .trim() || "document";

  if (format === "md") {
    return new Response(new TextEncoder().encode(text), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}.md"`,
      },
    });
  }

  if (format === "docx") {
    const doc = new Document({
      sections: [{ children: markdownToDocx(text) }],
    });
    const buffer = await Packer.toBuffer(doc);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeName}.docx"`,
      },
    });
  }

  return NextResponse.json({ error: "Unknown format" }, { status: 400 });
}
