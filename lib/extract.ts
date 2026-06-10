import "server-only";

/** Extracts plain text from an uploaded file (txt/md/pdf/docx). */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text.trim();
  }
  if (name.endsWith(".docx")) {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer });
    return value.trim();
  }
  // txt / md / anything text-like
  return buffer.toString("utf8").trim();
}
