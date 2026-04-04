import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { jsonResponse } from "@/lib/json-response";
import { createBalanceSnapshotsAllOrgs } from "@/server/jobs/balance-snapshotter";

export async function POST(req: NextRequest) {
  const secret =
    req.headers.get("x-internal-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!env.INTERNAL_JOB_SECRET || secret !== env.INTERNAL_JOB_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await createBalanceSnapshotsAllOrgs();
    const totalCreated = results.reduce((s, r) => s + r.snapshotsCreated, 0);
    return jsonResponse({ totalCreated, orgs: results });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
