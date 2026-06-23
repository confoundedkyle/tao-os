// Append-only progress log for a project's sourcing plan. Execution sourcing
// agents call this (via the calyflow_log_sourcing_progress tool) after they work,
// so the next run — which already gets the plan injected as context — sees what's
// been done. Pure + append-only: it only ever ADDS a fixed-format line under a
// "## Progress log" section, never rewriting the strategy body.

const PROGRESS_HEADING = "## Progress log";
const MAX_NOTE_CHARS = 500;

/** Collapse whitespace and cap a note so one entry can't blow the context budget. */
export function sanitizeProgressNote(note: string): string {
  const clean = note.replace(/\s+/g, " ").trim();
  return clean.length > MAX_NOTE_CHARS
    ? `${clean.slice(0, MAX_NOTE_CHARS - 1)}…`
    : clean;
}

/**
 * Append a progress entry to the plan markdown. Ensures a single
 * "## Progress log" section exists (adds the heading once if absent) and appends
 * `- **{dateLabel}** — {note}` at the end. Existing content is never modified.
 * Returns the original text unchanged when the note is empty.
 */
export function appendProgressEntry(
  existingMarkdown: string,
  dateLabel: string,
  note: string,
): string {
  const cleanNote = sanitizeProgressNote(note);
  if (!cleanNote) return existingMarkdown;

  const entry = `- **${dateLabel}** — ${cleanNote}`;
  const base = existingMarkdown.replace(/\s+$/, ""); // trim trailing blank lines

  if (base.includes(PROGRESS_HEADING)) {
    // Section already present — just append the new line at the very end.
    return `${base}\n${entry}\n`;
  }
  // First entry — create the section.
  return `${base}\n\n${PROGRESS_HEADING}\n${entry}\n`;
}
