import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/db";
import { requireOrgMember } from "@/lib/require-org-role";
import Link from "next/link";
import { EditRequestClient } from "./edit-request-client";
import { bigIntToString } from "@/lib/bigint";

export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const { id: requestId } = await params;
  const req = await prisma.expenseRequest.findUnique({
    where: { id: requestId },
    include: { department: true, vendor: true },
  });
  if (!req || req.status !== "DRAFT" || req.requesterUserId !== user.id) notFound();
  try {
    await requireOrgMember(req.orgId, user.id);
  } catch {
    notFound();
  }
  const departments = await prisma.department.findMany({ where: { orgId: req.orgId }, orderBy: { name: "asc" } });
  const vendors = await prisma.vendor.findMany({ where: { orgId: req.orgId }, orderBy: { name: "asc" } });
  return (
    <div>
      <div className="mb-4">
        <Link href={`/app/requests/${req.id}`} className="text-sm text-slate-600 hover:underline">Back to request</Link>
      </div>
      <h1 className="text-xl font-semibold text-slate-900">Edit draft</h1>
      <EditRequestClient
        requestId={requestId}
        orgId={req.orgId}
        initial={{ departmentId: req.departmentId, vendorId: req.vendorId, title: req.title, purpose: req.purpose, category: req.category, amountMinor: bigIntToString(req.amountMinor) }}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
      />
    </div>
  );
}
