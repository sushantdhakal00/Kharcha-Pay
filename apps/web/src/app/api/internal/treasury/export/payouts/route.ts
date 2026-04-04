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

  const payouts = await prisma.treasuryPayoutIntent.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 50000,
  });

  if (format === "csv") {
    const headers = [
      "id",
      "orgId",
      "provider",
      "status",
      "amountMinor",
      "currency",
      "vendorId",
      "payoutRail",
      "providerPayoutId",
      "onchainTxSig",
      "idempotencyKey",
      "riskStatus",
      "failureCode",
      "failureMessage",
      "createdAt",
      "updatedAt",
    ];
    const rows = payouts.map((p) =>
      [
        p.id,
        p.orgId,
        p.provider,
        p.status,
        p.amountMinor.toString(),
        p.currency,
        p.vendorId ?? "",
        p.payoutRail,
        p.providerPayoutId ?? "",
        p.onchainTxSig ?? "",
        p.idempotencyKey ?? "",
        p.riskStatus,
        p.failureCode ?? "",
        (p.failureMessage ?? "").replace(/,/g, ";"),
        p.createdAt.toISOString(),
        p.updatedAt.toISOString(),
      ].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="payouts-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const serialized = payouts.map((p) => ({
    ...p,
    amountMinor: p.amountMinor.toString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return NextResponse.json({ count: serialized.length, payouts: serialized });
}
