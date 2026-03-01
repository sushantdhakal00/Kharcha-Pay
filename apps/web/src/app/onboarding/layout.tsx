import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import Link from "next/link";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirect=/onboarding/create-org");

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#18181B]">
      <header className="border-b border-slate-200 bg-white dark:border-zinc-800 dark:bg-[#1E1E22]">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link href="/" className="font-semibold text-slate-900 dark:text-stone-100">
            KharchaPay
          </Link>
          <span className="text-sm text-slate-600 dark:text-stone-400">{user.username}</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
