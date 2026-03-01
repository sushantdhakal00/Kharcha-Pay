"use client";

import { useEffect, useState, useCallback, createContext, useContext } from "react";
import { getCsrfToken } from "@/lib/fetch-with-csrf";
import { ReauthModal } from "./reauth-modal";

type ReauthRetry = () => void | Promise<void>;

const ReauthContext = createContext<{
  showReauth: (retry: ReauthRetry) => void;
} | null>(null);

export function useReauth() {
  const ctx = useContext(ReauthContext);
  return ctx;
}

export function CsrfAndReauthProvider({ children }: { children: React.ReactNode }) {
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthRetry, setReauthRetry] = useState<ReauthRetry | null>(null);

  useEffect(() => {
    getCsrfToken().catch(() => {});
  }, []);

  const showReauth = useCallback((retry: ReauthRetry) => {
    setReauthRetry(() => retry);
    setReauthOpen(true);
  }, []);

  const handleReauthClose = useCallback(() => {
    setReauthOpen(false);
    setReauthRetry(null);
  }, []);

  const handleReauthSuccess = useCallback(async () => {
    if (reauthRetry) await reauthRetry();
    setReauthRetry(null);
  }, [reauthRetry]);

  return (
    <ReauthContext.Provider value={{ showReauth }}>
      {children}
      <ReauthModal
        open={reauthOpen}
        onClose={handleReauthClose}
        onSuccess={handleReauthSuccess}
      />
    </ReauthContext.Provider>
  );
}
