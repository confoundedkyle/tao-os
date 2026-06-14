"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/ui";
import { useToast } from "@/components/use-toast";

export interface RunSidebarItem {
  id: string;
  name: string;
  /** Workflows and agents are shown together, no visual distinction. */
  kind: "workflow" | "agent";
  ready: boolean;
}

/**
 * Slack-channel-style list of everything runnable in a project — workflows and
 * agents intermixed in one flat, searchable list. Selecting an item navigates
 * to `${baseHref}/${id}`. Users can reorder the list by drag & drop and save it;
 * the order is remembered per project (localStorage).
 */
export function RunSidebar({
  items,
  baseHref,
}: {
  items: RunSidebarItem[];
  baseHref: string;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [reordering, setReordering] = useState(false);
  const [draft, setDraft] = useState<RunSidebarItem[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  const storageKey = `calyflow:run-sidebar:order:${baseHref}`;

  // Read the saved order via useSyncExternalStore (no SSR mismatch; adopted
  // right after mount) — same pattern as usePersistedSelection.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = (e: Event) => {
        if (e instanceof StorageEvent && e.key !== null && e.key !== storageKey)
          return;
        onChange();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
    [storageKey],
  );
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }, [storageKey]);
  const storedRaw = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const orderIds = useMemo<string[]>(() => {
    try {
      return storedRaw ? (JSON.parse(storedRaw) as string[]) : [];
    } catch {
      return [];
    }
  }, [storedRaw]);

  // Items in the saved order, with any items not yet ordered appended in place.
  const ordered = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const seen = new Set<string>();
    const result: RunSidebarItem[] = [];
    for (const id of orderIds) {
      const it = byId.get(id);
      if (it) {
        result.push(it);
        seen.add(id);
      }
    }
    for (const it of items) if (!seen.has(it.id)) result.push(it);
    return result;
  }, [items, orderIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ordered.filter((i) => i.name.toLowerCase().includes(q)) : ordered;
  }, [ordered, query]);

  function startReorder() {
    setDraft(ordered);
    setQuery("");
    setReordering(true);
  }

  function saveReorder() {
    const ids = draft.map((i) => i.id);
    try {
      localStorage.setItem(storageKey, JSON.stringify(ids));
    } catch {
      /* private mode / quota — order just won't persist */
    }
    // `storage` doesn't fire in the document that wrote it — nudge our reader.
    window.dispatchEvent(new StorageEvent("storage", { key: storageKey }));
    setReordering(false);
    showToast("Agent order saved");
  }

  function onDragOver(e: React.DragEvent, overId: string) {
    e.preventDefault();
    if (!dragId || dragId === overId) return;
    setDraft((prev) => {
      const from = prev.findIndex((i) => i.id === dragId);
      const to = prev.findIndex((i) => i.id === overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function Dot({ ready }: { ready: boolean }) {
    return (
      <span
        aria-hidden
        className={`h-2 w-2 flex-shrink-0 rounded-full ${
          ready ? "bg-mint-400" : "border border-amber-400 bg-transparent"
        }`}
      />
    );
  }

  return (
    <aside className="flex-shrink-0 rounded-card border border-navy-800/10 bg-cream-50 lg:sticky lg:top-2 lg:w-60 lg:max-h-[calc(100dvh-1rem)] lg:self-start lg:overflow-y-auto">
      <div className="border-b border-navy-800/8 p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-bold uppercase tracking-wider text-navy-800/45">
            Agents
          </p>
          {!reordering && (
            <div className="flex items-center gap-0.5">
              <Link
                href="/library"
                title="Add an agent"
                aria-label="Add an agent"
                className="rounded p-0.5 text-navy-800/40 transition hover:bg-navy-800/8 hover:text-mint-700"
              >
                <PlusIcon />
              </Link>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={startReorder}
                  title="Reorder agents"
                  aria-label="Reorder agents"
                  className="rounded p-0.5 text-navy-800/40 transition hover:bg-navy-800/8 hover:text-navy-800/80"
                >
                  <ReorderIcon />
                </button>
              )}
            </div>
          )}
        </div>
        {!reordering && items.length > 0 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full rounded-chip border border-navy-800/15 bg-white px-3 py-1.5 text-sm outline-none transition focus:border-mint-700 placeholder:text-navy-800/35"
          />
        )}
      </div>

      {items.length === 0 ? (
        <div className="p-4 text-sm text-navy-800/55">
          <p className="mb-3">Nothing here yet.</p>
          <ButtonLink href="/library" variant="small">
            Browse the library
          </ButtonLink>
        </div>
      ) : reordering ? (
        <div className="p-2">
          <ul className="flex flex-col gap-0.5">
            {draft.map((item) => (
              <li
                key={item.id}
                draggable
                onDragStart={() => setDragId(item.id)}
                onDragOver={(e) => onDragOver(e, item.id)}
                onDragEnd={() => setDragId(null)}
                className={`flex cursor-grab items-center gap-2 rounded-chip border border-navy-800/10 bg-white px-2.5 py-2 text-sm active:cursor-grabbing ${
                  dragId === item.id ? "opacity-50" : ""
                }`}
              >
                <span aria-hidden className="text-navy-800/30">
                  ⠿
                </span>
                <Dot ready={item.ready} />
                <span
                  title={item.name}
                  className="min-w-0 truncate text-navy-800/75"
                >
                  {item.name}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={saveReorder}
              className="flex-1 rounded-chip bg-mint-400 px-3 py-1.5 text-sm font-bold text-navy-800 transition hover:brightness-105"
            >
              Save order
            </button>
            <button
              type="button"
              onClick={() => setReordering(false)}
              className="rounded-chip border border-navy-800/20 px-3 py-1.5 text-sm font-semibold text-navy-800/70 transition hover:border-navy-800"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="p-4 text-sm text-navy-800/45">No matches for “{query}”.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 p-2">
          {filtered.map((item) => {
            const href = `${baseHref}/${item.id}`;
            const active = pathname === href;
            return (
              <li key={item.id}>
                <Link
                  href={href}
                  className={`flex items-center gap-2.5 rounded-chip px-2.5 py-2 text-sm transition ${
                    active
                      ? "bg-mint-400/15 font-semibold text-mint-700"
                      : "text-navy-800/65 hover:bg-cream-100"
                  }`}
                >
                  <Dot ready={item.ready} />
                  <span title={item.name} className="min-w-0 truncate">
                    {item.name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {toast}
    </aside>
  );
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ReorderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}
