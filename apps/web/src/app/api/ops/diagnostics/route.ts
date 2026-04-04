import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { OrgRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getConnection, RpcNotConfiguredError } from "@/lib/solana/connection";

/**
 * GET /api/ops/diagnostics?orgId=xxx
 * ADMIN only. Returns safe env booleans (no values), DB connection test, Solana blockhash test.
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

    const envSafe = {
      databaseUrl: !!process.env.DATABASE_URL,
      jwtSecret: !!process.env.JWT_SECRET,
      solanaRpcUrl: !!process.env.SOLANA_RPC_URL,
      treasuryKeypair: !!process.env.TREASURY_KEYPAIR_JSON,
      nextPublicAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
    };

    let dbConnected = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbConnected = true;
    } catch {
      // leave false
    }

    let solanaOk = false;
    let solanaBlockhash: string | null = null;
    let solanaError: string | null = null;
    try {
      const conn = getConnection();
      const { blockhash } = await conn.getLatestBlockhash();
      solanaBlockhash = blockhash;
      solanaOk = true;
    } catch (e) {
      solanaError = e instanceof RpcNotConfiguredError ? "RPC_NOT_CONFIGURED" : "RPC_ERROR";
    }

    return NextResponse.json({
      env: envSafe,
      dbConnected,
      solanaOk,
      solanaBlockhash,
      ...(solanaError && { solanaError }),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
