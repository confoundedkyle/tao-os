import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { extractTextFromFile } from "@/lib/extract";

// Extracts plain text from an uploaded file WITHOUT storing it. Used by the
// agent run panel's "Attach files" control: the text is sent back to the
// client and folded into the next run only — it never becomes a project
// document. (To persist a file, the user uploads it in the Documents tab.)

export const maxDuration = 60;

const ACCEPT = [".pdf", ".docx", ".txt", ".md"];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — matches the Documents upload cap.

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (20 MB max)" }, { status: 400 });
  }
  const lower = file.name.toLowerCase();
  if (!ACCEPT.some((ext) => lower.endsWith(ext))) {
    return NextResponse.json(
      { error: "Unsupported file type — use PDF, DOCX, TXT, or MD." },
      { status: 400 },
    );
  }

  try {
    const text = await extractTextFromFile(file);
    if (!text) {
      return NextResponse.json(
        { error: "Couldn't read any text from that file." },
        { status: 400 },
      );
    }
    return NextResponse.json({ name: file.name, text });
  } catch {
    return NextResponse.json(
      { error: "Couldn't read that file." },
      { status: 400 },
    );
  }
}
