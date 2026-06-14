"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createClientAction } from "@/lib/actions/clients";
import { Button, inputClass } from "./ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="small" disabled={pending}>
      {pending ? "Creating…" : "Create client"}
    </Button>
  );
}

/** Primary trigger button (use it as a PageHeader action or an EmptyState CTA)
 *  that opens a focused modal to name a new client. The create action redirects
 *  to the new client on success, so the modal needs no close-on-success logic. */
export function AddClient({
  className,
  children = "New client",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New client"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-panel border border-navy-800/12 bg-white p-6 shadow-lift"
          >
            <h3 className="text-lg font-semibold">New client</h3>
            <p className="mt-1 text-sm text-navy-800/55">
              Each client has its own knowledge base, files, and projects.
            </p>
            <form action={createClientAction} className="mt-4">
              <input
                ref={inputRef}
                name="name"
                required
                placeholder="e.g. Acme GmbH"
                className={inputClass}
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-chip px-4 py-2 text-sm font-medium text-navy-800/55 transition hover:text-navy-900"
                >
                  Cancel
                </button>
                <SubmitButton />
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
