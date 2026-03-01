import Link from "next/link";
import { Suspense } from "react";
import { PricingContent } from "./pricing-content";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#18181B]">
      <nav className="border-b border-slate-200 bg-white dark:border-zinc-800 dark:bg-[#1E1E22]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="font-semibold text-slate-900 dark:text-stone-100">
            KharchaPay
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/pricing" className="text-sm font-medium text-slate-700 dark:text-stone-300">
              Pricing
            </Link>
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 dark:text-stone-400 dark:hover:text-stone-100">
              Sign in
            </Link>
            <Link
              href="/register?redirect=/onboarding/create-org"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-stone-100 dark:text-zinc-900 dark:hover:bg-stone-200"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-stone-100">Pricing</h1>
        <p className="mt-2 text-slate-600 dark:text-stone-400">
          Simple, transparent pricing. One-time fee per organization.
        </p>

        <div className="mt-12 rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-stone-100">
            Organization setup fee
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-stone-400">
            One-time per organization. Pay once to create your workspace.
          </p>
          <div className="mt-6 flex items-baseline gap-2">
            <Suspense fallback={<span className="text-2xl font-bold text-slate-900 dark:text-stone-100">—</span>}>
              <PricingContent />
            </Suspense>
          </div>
          <Link
            href="/register?redirect=/onboarding/create-org"
            className="mt-8 inline-block rounded-lg bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-stone-100 dark:text-zinc-900 dark:hover:bg-stone-200"
          >
            Create organization
          </Link>
        </div>
      </div>
    </main>
  );
}
