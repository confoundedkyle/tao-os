"use client";

import { useState, type ReactNode } from "react";
import { Toast } from "./toast";

/**
 * Local success-toast state. Render `toast` anywhere in the component tree
 * (Toast is position: fixed) and call `showToast` after an action resolves.
 * Incrementing the key re-mounts the Toast so repeat actions restart its timer.
 */
export function useToast(): {
  toast: ReactNode;
  showToast: (message: string) => void;
} {
  const [key, setKey] = useState(0);
  const [message, setMessage] = useState("");

  return {
    toast: key > 0 ? <Toast key={key} message={message} /> : null,
    showToast: (msg: string) => {
      setMessage(msg);
      setKey((k) => k + 1);
    },
  };
}
