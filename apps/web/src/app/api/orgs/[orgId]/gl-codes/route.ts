import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgReadAccess, requireOrgRole } from "@/lib/require-org-role";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";
import { OrgRole } from "@prisma/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgReadAccess(orgId, user.id);

    const codes = await prisma.orgGLCode.findMany({
      where: { orgId, isActive: true },
      orderBy: { code: "asc" },
    });

    return jsonResponse({
      glCodes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? "").trim().toUpperCase();
    const name = String(body.name ?? "").trim();

    if (!code || !name) {
      return NextResponse.json(
        { error: "code and name required" },
        { status: 400 }
      );
    }

    const existing = await prisma.orgGLCode.findUnique({
      where: { orgId_code: { orgId, code } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "GL code already exists" },
        { status: 400 }
      );
    }

    const gl = await prisma.orgGLCode.create({
      data: { orgId, code, name },
    });

    return jsonResponse({
      glCode: { id: gl.id, code: gl.code, name: gl.name },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
