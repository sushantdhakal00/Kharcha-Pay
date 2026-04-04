"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { OrgRole } from "@prisma/client";

const STORAGE_KEY = "kharchapay_view_as_role";

const ViewAsRoleContext = createContext<{
  viewAsRole: OrgRole | null;
  setViewAsRole: (role: OrgRole | null) => void;
  effectiveRole: OrgRole;
  isOverridden: boolean;
} | null>(null);

export function ViewAsRoleProvider({
  actualRole,
  children,
}: {
  actualRole: OrgRole;
  children: React.ReactNode;
}) {
  const [viewAsRole, setViewAsRoleState] = useState<OrgRole | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v && ["ADMIN", "APPROVER", "STAFF", "AUDITOR"].includes(v)) {
        setViewAsRoleState(v as OrgRole);
      }
    } catch {}
  }, []);

  const setViewAsRole = useCallback((role: OrgRole | null) => {
    setViewAsRoleState(role);
    try {
      if (role) localStorage.setItem(STORAGE_KEY, role);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const effectiveRole = mounted && viewAsRole ? viewAsRole : actualRole;
  const isOverridden = mounted && viewAsRole !== null && viewAsRole !== actualRole;

  return (
    <ViewAsRoleContext.Provider
      value={{ viewAsRole, setViewAsRole, effectiveRole, isOverridden }}
    >
      {children}
    </ViewAsRoleContext.Provider>
  );
}

export function useViewAsRole() {
  const ctx = useContext(ViewAsRoleContext);
  return ctx;
}
