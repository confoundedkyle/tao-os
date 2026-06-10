"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Shown after an import redirect (/workflows?imported=<id>). Auto-dismisses
 * and strips the query param so the card highlight fades with it and a
 * refresh doesn't replay the toast.
 */
export function ImportedToast() {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      router.replace("/workflows", { scroll: false });
    }, 4000);
    return () => clearTimeout(timer);
  }, [router]);

  if (!visible) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-card bg-navy-900 px-4 py-3 text-sm font-semibold text-cream-50 shadow-lift"
    >
      <span className="text-mint-400">✓</span> Workflow imported
    </div>
  );
}
