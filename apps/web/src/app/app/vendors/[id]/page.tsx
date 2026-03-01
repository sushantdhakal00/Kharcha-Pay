import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Vendor360Client } from "./vendor-360-client";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) redirect("/app/setup");

  const { id: vendorId } = await params;
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, orgId: active.id },
  });
  if (!vendor) notFound();

  const isAdmin = active.role === "ADMIN";
  const isApprover = active.role === "ADMIN" || active.role === "APPROVER";
  const canWrite = active.role === "ADMIN" || active.role === "STAFF" || active.role === "APPROVER";

  return (
    <div>
      <Link
        href="/app/vendors"
        className="text-sm text-slate-600 hover:underline dark:text-slate-400"
      >
        ← Vendors
      </Link>
      <h1 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
        {vendor.displayName ?? vendor.name}
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Vendor 360: profile, onboarding, documents, payment methods, activity.
      </p>
      <Vendor360Client
        orgId={active.id}
        vendorId={vendorId}
        isAdmin={isAdmin}
        isApprover={isApprover}
        canWrite={canWrite}
      />
    </div>
  );
}
