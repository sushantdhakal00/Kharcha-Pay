import { NextResponse } from "next/server";
import { departmentCreateSchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgReadAccess, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const departments = await prisma.department.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { orgId } = await params;
    await requireOrgWriteAccess(orgId, user.id);
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await request.json();
    const parsed = departmentCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { name } = parsed.data;

    const existing = await prisma.department.findUnique({
      where: { orgId_name: { orgId, name: name.trim() } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Department with this name already exists" },
        { status: 409 }
      );
    }

    const department = await prisma.department.create({
      data: { orgId, name: name.trim() },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "DEPT_CREATED",
      entityType: "Department",
      entityId: department.id,
      after: { id: department.id, name: department.name },
    });

    return NextResponse.json({
      department: {
        id: department.id,
        name: department.name,
        createdAt: department.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
