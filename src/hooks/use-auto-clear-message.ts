import { useEffect } from "react";

export function useAutoClearMessage(
  message: string | null,
  setMessage: (value: string | null) => void,
  delayMs = 10_000
) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), delayMs);
    return () => window.clearTimeout(timer);
  }, [message, setMessage, delayMs]);
}
