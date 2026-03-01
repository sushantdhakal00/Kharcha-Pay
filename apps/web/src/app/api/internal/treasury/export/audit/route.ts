import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-internal-secret");
  if (
    process.env.INTERNAL_JOB_SECRET &&
    secret !== process.env.INTERNAL_JOB_SECRET
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const orgId = url.searchParams.get("orgId");

  const where: Record<string, unknown> = {};
  if (orgId) where.orgId = orgId;
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from);
    if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to);
  }

  const logs = await prisma.treasuryAuditLog.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 50000,
  });

  if (format === "csv") {
    const headers = [
      "id",
      "orgId",
      "actorId",
      "action",
      "entityType",
      "entityId",
      "metadata",
      "createdAt",
    ];
    const rows = logs.map((l) =>
      [
        l.id,
        l.orgId,
        l.actorId ?? "",
        l.action,
        l.entityType,
        l.entityId,
        JSON.stringify(l.metadata ?? {}).replace(/,/g, ";"),
        l.createdAt.toISOString(),
      ].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="audit-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const serialized = logs.map((l) => ({
    ...l,
    createdAt: l.createdAt.toISOString(),
  }));

  return NextResponse.json({ count: serialized.length, logs: serialized });
}
