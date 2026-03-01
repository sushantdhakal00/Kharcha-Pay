import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { jsonResponse } from "@/lib/json-response";

const CACHE_KEY = "sol_usd";
const CACHE_HOURS = 4;
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

export async function GET() {
  try {
    const now = new Date();
    const cached = await prisma.cachedExchangeRate.findUnique({
      where: { id: CACHE_KEY },
    });
    if (cached && cached.expiresAt > now) {
      return jsonResponse({
        ok: true,
        rateUsd: Number(cached.value),
        fetchedAt: cached.fetchedAt.toISOString(),
      });
    }
    const res = await fetch(COINGECKO_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return jsonResponse({ ok: false }, { status: 502 });
    }
    const data = (await res.json()) as { solana?: { usd?: number } };
    const rate = data?.solana?.usd;
    if (typeof rate !== "number" || rate <= 0) {
      return jsonResponse({ ok: false }, { status: 502 });
    }
    const expiresAt = new Date(now.getTime() + CACHE_HOURS * 60 * 60 * 1000);
    await prisma.cachedExchangeRate.upsert({
      where: { id: CACHE_KEY },
      create: {
        id: CACHE_KEY,
        value: rate,
        fetchedAt: now,
        expiresAt,
      },
      update: {
        value: rate,
        fetchedAt: now,
        expiresAt,
      },
    });
    return jsonResponse({
      ok: true,
      rateUsd: rate,
      fetchedAt: now.toISOString(),
    });
  } catch (e) {
    console.error("[pricing/sol-usd]", e);
    return jsonResponse({ ok: false }, { status: 500 });
  }
}
