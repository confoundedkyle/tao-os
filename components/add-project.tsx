"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createProjectAction } from "@/lib/actions/clients";
import { inputClass } from "./ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-chip bg-mint-400 px-4 py-2 text-sm font-bold text-navy-900 transition hover:brightness-105 disabled:opacity-50"
    >
      {pending ? "Creating…" : "Create"}
    </button>
  );
}

/** Collapsed by default — the input only appears once you choose to add a
 *  project, so the block stays clean when you're just scanning the list. */
export function AddProject({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-card border-[1.5px] border-dashed border-navy-800/20 py-2.5 text-sm font-semibold text-navy-800/55 transition hover:border-mint-700/50 hover:bg-mint-400/5 hover:text-mint-700"
      >
        <span aria-hidden className="text-base leading-none">+</span>
        New project
      </button>
    );
  }

  return (
    <form action={createProjectAction} className="mb-4 flex gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input
        ref={inputRef}
        name="name"
        required
        placeholder='e.g. "Senior DevOps – Berlin"'
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        className={inputClass}
      />
      <SubmitButton />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="shrink-0 rounded-chip px-3 text-sm font-medium text-navy-800/50 transition hover:text-navy-900"
      >
        Cancel
      </button>
    </form>
  );
}
