"use client";

import { useState } from "react";
import { Toast } from "./toast";

/**
 * A <form> around a server action that confirms success with a bottom-right
 * toast and surfaces failures inline — for fire-and-forget settings saves
 * that otherwise give no feedback.
 */
export function ToastForm({
  action,
  message = "Saved",
  className,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  message?: string;
  className?: string;
  children: React.ReactNode;
}) {
  // Incrementing key re-mounts the Toast so a re-save restarts its timer.
  const [toastKey, setToastKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handle(formData: FormData) {
    try {
      setError(null);
      await action(formData);
      setToastKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  }

  return (
    <>
      <form action={handle} className={className}>
        {children}
        {error && (
          <p className="mt-3 rounded-chip bg-coral-400/12 px-3 py-2 text-sm text-coral-400">
            {error}
          </p>
        )}
      </form>
      {toastKey > 0 && <Toast key={toastKey} message={message} />}
    </>
  );
}
