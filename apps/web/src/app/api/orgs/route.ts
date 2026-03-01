import { NextResponse } from "next/server";
import { orgCreateSchema } from "@kharchapay/shared";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { OrgRole } from "@prisma/client";
import { logAuditEvent } from "@/lib/audit";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const includeDemo = searchParams.get("includeDemo") === "1";

    const memberships = await prisma.membership.findMany({
      where: {
        userId: user.id,
        ...(includeDemo ? {} : { org: { isDemo: false } }),
      },
      include: { org: true },
      orderBy: { createdAt: "asc" },
    });
    const orgs = memberships.map((m) => ({
      id: m.org.id,
      name: m.org.name,
      slug: m.org.slug,
      isDemo: m.org.isDemo ?? false,
      createdAt: m.org.createdAt.toISOString(),
      role: m.role,
    }));
    return NextResponse.json({ orgs });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const body = await request.json();
    const parsed = orgCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const data = parsed.data as { name: string; slug: string; currency?: string };
    const { name, slug, currency = "USD" } = data;
    const slugLower = slug.toLowerCase();

    const existing = await prisma.organization.findUnique({
      where: { slug: slugLower },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Organization slug already taken" },
        { status: 409 }
      );
    }

    const org = await prisma.organization.create({
      data: {
        name,
        slug: slugLower,
        currency: currency.length === 3 ? currency : "USD",
        memberships: {
          create: {
            userId: user.id,
            role: OrgRole.ADMIN,
          },
        },
      },
    });

    await logAuditEvent({
      orgId: org.id,
      actorUserId: user.id,
      action: "ORG_CREATED",
      entityType: "Organization",
      entityId: org.id,
      after: { id: org.id, name: org.name, slug: org.slug },
    });

    return NextResponse.json({
      org: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        createdAt: org.createdAt.toISOString(),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
