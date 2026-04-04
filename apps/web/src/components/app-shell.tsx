"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "./sidebar";
import { MobileSidebarDrawer, MobileSidebarTrigger } from "./mobile-sidebar-drawer";
import { NotificationsBell } from "./notifications-bell";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "./theme-toggle";
import { ViewAsRoleProvider } from "./view-as-role-context";
import { TourProvider } from "./tours/tour-provider";
import { TourTooltip } from "./tours/tour-tooltip";
import type { OrgRole } from "@prisma/client";

export function AppShell({
  role,
  orgId,
  orgName,
  userId,
  user,
  children,
}: {
  role: OrgRole;
  orgId: string | null;
  orgName: string | null;
  userId: string;
  user: { username: string; email: string; imageUrl: string | null };
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <ViewAsRoleProvider actualRole={role}>
      <TourProvider userId={userId} orgId={orgId ?? ""} role={role}>
        <div className="flex min-h-screen bg-slate-50 dark:bg-[#18181B]">
          <div className="hidden lg:block">
            <Sidebar role={role} orgName={orgName} orgId={orgId} userId={userId} />
          </div>
          <MobileSidebarDrawer
            role={role}
            orgName={orgName}
            orgId={orgId}
            userId={userId}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 dark:border-zinc-800 dark:bg-[#1E1E22]">
              <div className="flex items-center gap-3">
                <MobileSidebarTrigger onClick={() => setDrawerOpen(true)} />
                {orgName && (
                  <span className="hidden truncate text-sm font-medium text-slate-700 dark:text-slate-300 sm:block lg:max-w-[200px]">
                    {orgName}
                  </span>
                )}
              </div>
              <div className="flex flex-1 items-center justify-end gap-2">
                <span data-tour="header.theme-toggle">
                  <ThemeToggle />
                </span>
                <Link
                  href="/app/docs"
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  Docs
                </Link>
                <span data-tour="header.notifications">
                  <NotificationsBell />
                </span>
                <span data-tour="header.user-menu">
                  <UserMenu
                    username={user.username}
                    email={user.email}
                    imageUrl={user.imageUrl}
                    orgName={orgName}
                    orgRole={role}
                  />
                </span>
              </div>
            </header>
            <main className="flex-1 p-4 md:p-6">{children}</main>
          </div>
        </div>
        <TourTooltip />
      </TourProvider>
    </ViewAsRoleProvider>
  );
}
