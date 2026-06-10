"use client";

import { useTransition } from "react";
import { deleteDocumentAction } from "@/lib/actions/documents";

export function DeleteDocButton({
  docId,
  filename,
}: {
  docId: string;
  filename: string | null;
}) {
  const [pending, startTransition] = useTransition();

  function remove() {
    if (
      !window.confirm(
        `Delete "${filename ?? "Untitled"}"? This cannot be undone.`,
      )
    )
      return;
    startTransition(async () => {
      await deleteDocumentAction(docId);
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="text-sm text-navy-800/40 transition hover:text-coral-400 disabled:opacity-40"
      aria-label={`Delete ${filename ?? "Untitled"}`}
    >
      ✕
    </button>
  );
}
