"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Prevents loading skeleton from flashing when data loads very quickly.
 * Keeps skeleton visible for at least minMs so transitions feel smooth.
 */
export function useSmoothLoading(loading: boolean, minMs = 220): boolean {
  const [showLoader, setShowLoader] = useState(true);
  const loadStartedAt = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (loading) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      loadStartedAt.current = Date.now();
      setShowLoader(true);
      return;
    }

    const elapsed = loadStartedAt.current ? Date.now() - loadStartedAt.current : minMs;
    const remaining = Math.max(0, minMs - elapsed);

    timerRef.current = setTimeout(() => {
      loadStartedAt.current = null;
      setShowLoader(false);
      timerRef.current = null;
    }, remaining);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [loading, minMs]);

  return showLoader;
}
