import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole, getActiveOrgWithStatusForUser } from "@/lib/get-active-org";
import { CsrfAndReauthProvider } from "@/components/csrf-and-reauth-provider";
import { AppShell } from "@/components/app-shell";
import { TreasuryStatusBanner } from "@/components/treasury-status-banner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const activeWithStatus = await getActiveOrgWithStatusForUser(user);
  if (activeWithStatus?.status === "PENDING_PAYMENT" && activeWithStatus.setupPaymentIntentId) {
    redirect(`/onboarding/pay?intentId=${activeWithStatus.setupPaymentIntentId}`);
  }
  if (activeWithStatus?.status === "PENDING_TERMS") {
    redirect(`/onboarding/terms?orgId=${activeWithStatus.id}`);
  }

  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);
  const role = activeWithRole?.role ?? "STAFF";

  return (
    <CsrfAndReauthProvider>
      <TreasuryStatusBanner />
      <AppShell
        role={role}
        orgId={activeWithRole?.id ?? null}
        orgName={activeOrg?.name ?? null}
        userId={user.id}
        user={{
          username: user.username,
          email: user.email,
          imageUrl: user.imageUrl ?? null,
        }}
      >
        {children}
      </AppShell>
    </CsrfAndReauthProvider>
  );
}
