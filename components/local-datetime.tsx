"use client";

import { useEffect, useState } from "react";

// Renders a timestamp in the viewer's local timezone. Formatting must happen in
// the browser — the server renders in its own tz (usually UTC), so date+time
// are filled in after mount (suppressHydrationWarning covers the swap).
export function LocalDateTime({ iso }: { iso: string }) {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    // Intentional post-hydration update: the local-tz value can't be known
    // until we're in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocal(
      new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  }, [iso]);

  return (
    <span suppressHydrationWarning>
      {local ??
        new Date(iso).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
        })}
    </span>
  );
}
