import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { jsonResponse } from "@/lib/json-response";

const CACHE_KEY = "sol_usd";
const CACHE_HOURS = 4;
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

export async function GET() {
  try {
    const feeSol = env.ORG_CREATE_FEE_SOL;
    const now = new Date();
    const cached = await prisma.cachedExchangeRate.findUnique({
      where: { id: CACHE_KEY },
    });
    let rateUsd: number | undefined;
    if (cached && cached.expiresAt > now) {
      rateUsd = Number(cached.value);
    } else {
      try {
        const res = await fetch(COINGECKO_URL, {
          headers: { Accept: "application/json" },
          next: { revalidate: 0 },
        });
        if (res.ok) {
          const data = (await res.json()) as { solana?: { usd?: number } };
          const rate = data?.solana?.usd;
          if (typeof rate === "number" && rate > 0) {
            rateUsd = rate;
            const expiresAt = new Date(now.getTime() + CACHE_HOURS * 60 * 60 * 1000);
            await prisma.cachedExchangeRate.upsert({
              where: { id: CACHE_KEY },
              create: { id: CACHE_KEY, value: rate, fetchedAt: now, expiresAt },
              update: { value: rate, fetchedAt: now, expiresAt },
            });
          }
        }
      } catch {
        // ignore
      }
    }
    return jsonResponse({
      feeSol,
      rateUsd: rateUsd ?? null,
      ok: true,
    });
  } catch (e) {
    console.error("[pricing]", e);
    return jsonResponse({ ok: false, feeSol: "0.006", rateUsd: null }, { status: 500 });
  }
}
