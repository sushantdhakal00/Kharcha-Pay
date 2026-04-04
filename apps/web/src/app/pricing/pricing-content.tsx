"use client";

import { useEffect, useState } from "react";

export function PricingContent() {
  const [data, setData] = useState<{
    ok: boolean;
    feeSol?: string;
    rateUsd?: number | null;
  } | null>(null);

  useEffect(() => {
    fetch("/api/pricing", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ ok: false }));
  }, []);

  const feeSol = data?.feeSol ?? "0.006";
  const usdEstimate =
    data?.ok && data?.rateUsd ? (parseFloat(feeSol) * data.rateUsd).toFixed(2) : null;

  return (
    <>
      <span className="text-2xl font-bold text-slate-900">{feeSol} SOL</span>
      {usdEstimate != null && (
        <span className="text-slate-600">≈ ${usdEstimate} USD</span>
      )}
    </>
  );
}
