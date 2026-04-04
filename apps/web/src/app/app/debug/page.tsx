import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser, getActiveOrgWithRole } from "@/lib/get-active-org";
import { prisma } from "@/lib/db";
import Link from "next/link";

/**
 * Protected /app/debug – quick sanity check: DB, auth, org, Solana config.
 * Only visible to logged-in users (app layout).
 */
export default async function DebugPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const activeOrg = await getActiveOrgForUser(user);
  const activeWithRole = await getActiveOrgWithRole(user);

  let chainConfig: Record<string, unknown> | null = null;
  let dbOk = false;
  try {
    if (activeOrg) {
      const config = await prisma.orgChainConfig.findUnique({
        where: { orgId: activeOrg.id },
      });
      if (config) {
        chainConfig = {
          cluster: config.cluster,
          token2022Mint: config.token2022Mint ?? null,
          treasuryTokenAccount: config.treasuryTokenAccount ?? null,
          hasTreasuryKeypair: !!process.env.TREASURY_KEYPAIR_JSON,
        };
      }
    }
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Debug / Sanity</h1>
        <Link href="/app" className="text-sm text-slate-600 hover:underline">
          Back to Dashboard
        </Link>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h2 className="font-medium text-slate-800">Auth</h2>
        <dl className="mt-2 grid gap-1">
          <div>
            <dt className="text-slate-500">User</dt>
            <dd className="font-mono">{user.username} ({user.id})</dd>
          </div>
        </dl>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h2 className="font-medium text-slate-800">DB</h2>
        <p className="mt-2">{dbOk ? "OK" : "Error (e.g. DATABASE_URL)"}</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h2 className="font-medium text-slate-800">Org</h2>
        {activeOrg ? (
          <dl className="mt-2 grid gap-1">
            <div>
              <dt className="text-slate-500">Active org</dt>
              <dd>{activeOrg.name} ({activeOrg.slug})</dd>
            </div>
            {activeWithRole && (
              <div>
                <dt className="text-slate-500">Your role</dt>
                <dd>{activeWithRole.role}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="mt-2 text-slate-500">No active org</p>
        )}
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h2 className="font-medium text-slate-800">Solana config (active org)</h2>
        {chainConfig ? (
          <pre className="mt-2 overflow-auto rounded bg-slate-50 p-2 text-xs">
            {JSON.stringify(chainConfig, null, 2)}
          </pre>
        ) : (
          <p className="mt-2 text-slate-500">No chain config or run Solana demo setup</p>
        )}
      </div>
      <p className="text-xs text-slate-500">
        <a href="/api/health" target="_blank" rel="noopener noreferrer" className="hover:underline">
          /api/health
        </a>{" "}
        – liveness (no auth)
      </p>
    </div>
  );
}
