"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_EVENT = "storage";

/**
 * `useState` for a selected id (a workflow, an agent) that survives navigating
 * away and back. The choice is stored in `localStorage` under `key`, so it
 * persists across remounts and full reloads on the same device.
 *
 * Backed by `useSyncExternalStore` so the server snapshot is the `fallback`
 * (no hydration mismatch) and the stored value is adopted right after mount.
 * A remembered id that `isValid` no longer accepts — e.g. a since-deleted
 * workflow — falls back to `fallback` instead of selecting nothing.
 */
export function usePersistedSelection(
  key: string,
  fallback: string,
  isValid: (value: string) => boolean,
): [string, (value: string) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      // Native `storage` events fire for other tabs; the manual dispatch in
      // `set` below covers same-document updates (which the spec omits).
      const handler = (e: Event) => {
        if (e instanceof StorageEvent && e.key !== null && e.key !== key) {
          return;
        }
        onChange();
      };
      window.addEventListener(STORAGE_EVENT, handler);
      return () => window.removeEventListener(STORAGE_EVENT, handler);
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Storage unavailable (private mode, disabled) — behave as unset.
      return null;
    }
  }, [key]);

  const stored = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const value = stored && isValid(stored) ? stored : fallback;

  const set = useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Ignore write failures (quota, private mode) — selection still works
        // for this session, it just won't be remembered.
      }
      // `storage` doesn't fire in the document that made the change, so nudge
      // our own subscriber to re-read.
      window.dispatchEvent(new StorageEvent(STORAGE_EVENT, { key }));
    },
    [key],
  );

  return [value, set];
}
