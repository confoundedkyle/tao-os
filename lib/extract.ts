import "server-only";

/** Postgres `text` columns reject NUL bytes (error 22P05), and PDF/DOCX
 *  extractors sometimes emit other control characters. Strip the C0 control
 *  range so the insert succeeds, keeping tab (0x09), newline (0x0A) and
 *  carriage return (0x0D). */
function sanitizeText(s: string): string {
  return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
}

/** Extracts plain text from an uploaded file (txt/md/pdf/docx). */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  let text: string;
  if (name.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text: pdfText } = await extractText(pdf, { mergePages: true });
    text = pdfText;
  } else if (name.endsWith(".docx")) {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer });
    text = value;
  } else {
    // txt / md / anything text-like
    text = buffer.toString("utf8");
  }
  return sanitizeText(text).trim();
}
