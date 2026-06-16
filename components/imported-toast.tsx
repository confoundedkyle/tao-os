"use client";

import { useRouter } from "next/navigation";
import { Toast } from "./toast";

/**
 * Shown after an import redirect (/agents?imported=<id>). On dismiss it strips
 * the query param so the card highlight fades with it and a refresh doesn't
 * replay the toast.
 */
export function ImportedToast() {
  const router = useRouter();
  return (
    <Toast
      message="Agent imported"
      duration={4000}
      onDismiss={() => router.replace("/agents", { scroll: false })}
    />
  );
}
