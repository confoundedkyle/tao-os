"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  deleteClientAction,
  renameClientAction,
  setClientStatusAction,
} from "@/lib/actions/clients";

const menuItem =
  "block w-full px-3.5 py-2 text-left text-sm text-navy-800/75 transition-colors hover:bg-cream-100 hover:text-navy-900 disabled:opacity-40";

/** Name + a standard ⋯ dropdown (Rename / Archive) for an active-client card.
 *  The parent Card must be `relative`. */
export function ClientCardActions({
  clientId,
  name,
}: {
  clientId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveRename() {
    startTransition(async () => {
      try {
        setError(null);
        await renameClientAction(clientId, value);
        setRenaming(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not rename");
      }
    });
  }

  function archive() {
    setOpen(false);
    startTransition(async () => {
      try {
        setError(null);
        await setClientStatusAction(clientId, "archived");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not archive");
      }
    });
  }

  return (
    <>
      {/* ⋯ menu — top right of the card */}
      <div className="absolute right-3 top-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={pending}
          aria-label={`Options for ${name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-navy-800/15 bg-cream-100 text-base leading-none text-navy-800/60 transition-colors hover:border-navy-800/35 hover:text-navy-900 disabled:opacity-40"
        >
          ⋯
        </button>
        {open && (
          <>
            {/* click-away backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpen(false)}
            />
            <div
              role="menu"
              className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-card border border-navy-800/12 bg-white py-1 shadow-lift"
            >
              <button
                type="button"
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  setOpen(false);
                  setValue(name);
                  setRenaming(true);
                }}
              >
                ✎ Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className={menuItem}
                onClick={archive}
              >
                Archive
              </button>
            </div>
          </>
        )}
      </div>

      {/* Name (or inline rename input) */}
      {renaming ? (
        <div className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") saveRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            className="w-full min-w-0 rounded-chip border border-navy-800/20 px-2.5 py-1 text-base font-semibold outline-none focus:border-mint-700"
          />
          <button
            type="button"
            onClick={saveRename}
            disabled={pending || !value.trim()}
            className="shrink-0 rounded-chip bg-mint-400/20 px-2.5 py-1 text-xs font-semibold text-mint-700 transition hover:bg-mint-400/35 disabled:opacity-40"
          >
            {pending ? "…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            disabled={pending}
            className="shrink-0 text-xs font-medium text-navy-800/45 transition hover:text-navy-900"
          >
            Cancel
          </button>
        </div>
      ) : (
        <Link
          href={`/clients/${clientId}`}
          className="text-lg font-semibold hover:text-mint-700"
        >
          {name}
        </Link>
      )}

      {error && <p className="mt-1 text-xs text-coral-400">{error}</p>}
    </>
  );
}

/** Restore/Delete controls for a row in the muted archived list. */
export function ArchivedClientActions({
  clientId,
  name,
}: {
  clientId: string;
  name: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      try {
        setError(null);
        await setClientStatusAction(clientId, "active");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not restore");
      }
    });
  }

  function remove() {
    if (
      !window.confirm(
        `Delete "${name}" and its knowledge base and files? This cannot be undone.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        setError(null);
        await deleteClientAction(clientId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-coral-400">{error}</span>}
      <button
        type="button"
        onClick={restore}
        disabled={pending}
        className="shrink-0 rounded-chip border border-mint-700/30 px-2.5 py-1 text-xs font-semibold text-mint-700 transition hover:bg-mint-400/10 disabled:opacity-40"
      >
        Restore
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="shrink-0 rounded-chip border border-navy-800/15 px-2.5 py-1 text-xs font-medium text-navy-800/45 transition hover:border-coral-400/50 hover:text-coral-400 disabled:opacity-40"
      >
        Delete
      </button>
    </div>
  );
}
