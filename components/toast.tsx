"use client";

import { useEffect, useState } from "react";

/** Bottom-right confirmation toast that auto-dismisses. */
export function Toast({
  message,
  duration = 3500,
  onDismiss,
}: {
  message: string;
  duration?: number;
  onDismiss?: () => void;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  if (!visible) return null;
  return (
    <div
      role="status"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-card bg-navy-900 px-4 py-3 text-sm font-semibold text-cream-50 shadow-lift"
    >
      <span className="text-mint-400">✓</span> {message}
    </div>
  );
}
