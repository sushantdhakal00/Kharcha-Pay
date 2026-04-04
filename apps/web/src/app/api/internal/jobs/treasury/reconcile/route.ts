import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { jsonResponse } from "@/lib/json-response";
import { runReconciliationAllOrgs } from "@/server/jobs/reconcile-treasury";

export async function POST(req: NextRequest) {
  const secret =
    req.headers.get("x-internal-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!env.INTERNAL_JOB_SECRET || secret !== env.INTERNAL_JOB_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runReconciliationAllOrgs();
    const worstSeverity = results.reduce<string>(
      (acc, r) =>
        ["INFO", "WARN", "CRITICAL"].indexOf(r.maxSeverity) >
        ["INFO", "WARN", "CRITICAL"].indexOf(acc)
          ? r.maxSeverity
          : acc,
      "INFO"
    );
    const totalDrift = results.reduce((s, r) => s + r.driftCount, 0);

    return jsonResponse({
      maxSeverity: worstSeverity,
      totalDrift,
      orgs: results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
