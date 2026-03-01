import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { OrgRole } from "@prisma/client";
import { getConnection, RpcNotConfiguredError } from "@/lib/solana/connection";
import { withTimeout } from "@/lib/solana/rpc";

const RPC_PROBE_TIMEOUT_MS = 10_000;

/**
 * GET /api/health/rpc?orgId=xxx
 * ADMIN only. Probes Solana RPC (getLatestBlockhash). Does not run on boot.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("orgId");
    if (!orgId) {
      return NextResponse.json({ error: "orgId required" }, { status: 400 });
    }
    await requireOrgRole(orgId, user.id, [OrgRole.ADMIN]);

    try {
      const conn = getConnection();
      await withTimeout(conn.getLatestBlockhash(), RPC_PROBE_TIMEOUT_MS);
      return NextResponse.json({ ok: true });
    } catch (e) {
      if (e instanceof RpcNotConfiguredError) {
        return NextResponse.json(
          { ok: false, code: "RPC_NOT_CONFIGURED" },
          { status: 503 }
        );
      }
      const msg = e instanceof Error ? e.message : String(e);
      const code = /timeout|timed out|ETIMEDOUT|RPC_TIMEOUT/i.test(msg)
        ? "RPC_TIMEOUT"
        : /ECONNREFUSED|fetch failed|unavailable|RPC_UNAVAILABLE/i.test(msg)
          ? "RPC_UNAVAILABLE"
          : "RPC_ERROR";
      return NextResponse.json(
        { ok: false, code },
        { status: 503 }
      );
    }
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
