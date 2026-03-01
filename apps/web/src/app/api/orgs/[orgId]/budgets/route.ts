import { NextResponse } from "next/server";
import { budgetUpsertSchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole, requireOrgReadAccess, requireOrgWriteAccess } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    if (!year || !month) {
      return NextResponse.json(
        { error: "year and month query params required" },
        { status: 400 }
      );
    }
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json(
        { error: "Invalid year or month" },
        { status: 400 }
      );
    }

    const budgets = await prisma.monthlyBudget.findMany({
      where: {
        orgId,
        year: yearNum,
        month: monthNum,
      },
      include: { department: { select: { id: true, name: true } } },
    });

    return NextResponse.json({
      budgets: budgets.map((b) => ({
        id: b.id,
        departmentId: b.departmentId,
        departmentName: b.department.name,
        year: b.year,
        month: b.month,
        amountMinor: Number(b.amountMinor),
        currency: b.currency,
        createdAt: b.createdAt.toISOString(),
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
    const parsed = budgetUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { departmentId, year, month, amountMinor, currency } = parsed.data;

    const department = await prisma.department.findFirst({
      where: { id: departmentId, orgId },
    });
    if (!department) {
      return NextResponse.json(
        { error: "Department not found in this org" },
        { status: 400 }
      );
    }

    const existingBudget = await prisma.monthlyBudget.findUnique({
      where: { departmentId_year_month: { departmentId, year, month } },
    });

    const budget = await prisma.monthlyBudget.upsert({
      where: {
        departmentId_year_month: { departmentId, year, month },
      },
      create: {
        orgId,
        departmentId,
        year,
        month,
        amountMinor: BigInt(amountMinor),
        currency: currency ?? "NPR",
      },
      update: {
        amountMinor: BigInt(amountMinor),
        currency: currency ?? "NPR",
      },
    });

    await logAuditEvent({
      orgId,
      actorUserId: user.id,
      action: "BUDGET_UPSERTED",
      entityType: "MonthlyBudget",
      entityId: budget.id,
      before: existingBudget
        ? {
            amountMinor: existingBudget.amountMinor.toString(),
            departmentId: existingBudget.departmentId,
            year: existingBudget.year,
            month: existingBudget.month,
          }
        : null,
      after: {
        amountMinor: budget.amountMinor.toString(),
        departmentId: budget.departmentId,
        year: budget.year,
        month: budget.month,
      },
    });

    return NextResponse.json({
      budget: {
        id: budget.id,
        departmentId: budget.departmentId,
        year: budget.year,
        month: budget.month,
        amountMinor: Number(budget.amountMinor),
        currency: budget.currency,
        createdAt: budget.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
