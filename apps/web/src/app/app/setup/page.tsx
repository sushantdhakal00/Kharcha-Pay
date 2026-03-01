import Link from "next/link";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgForUser } from "@/lib/get-active-org";
import { prisma } from "@/lib/db";

export default async function SetupPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const activeOrg = await getActiveOrgForUser(user);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let hasOrg = false;
  let deptCount = 0;
  let budgetCount = 0;

  if (activeOrg) {
    hasOrg = true;
    deptCount = await prisma.department.count({ where: { orgId: activeOrg.id } });
    budgetCount = await prisma.monthlyBudget.count({
      where: {
        orgId: activeOrg.id,
        year: currentYear,
        month: currentMonth,
      },
    });
  }

  const steps = [
    { id: "org", label: "Create organization", done: hasOrg, href: hasOrg ? null : "/onboarding/create-org", cta: hasOrg ? "Done" : "Create org" },
    { id: "dept", label: "Add at least one department", done: deptCount > 0, href: activeOrg ? "/app/settings/departments" : null, cta: deptCount > 0 ? "Done" : "Add department" },
    { id: "budget", label: "Set at least one budget for current month", done: budgetCount > 0, href: activeOrg ? "/app/settings/budgets" : null, cta: budgetCount > 0 ? "Done" : "Set budgets" },
  ];

  const allComplete = steps.every((s) => s.done);

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-slate-900">Setup wizard</h1>
      <p className="mt-1 text-sm text-slate-600">Complete these steps to start using KharchaPay.</p>
      {!hasOrg && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          If your organization already uses KharchaPay, share your email with your admin or head of organization so they can add you.
        </p>
      )}
      <ul className="mt-6 space-y-4">
        {steps.map((step) => (
          <li key={step.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <span className={step.done ? "text-green-600" : "text-slate-400"}>{step.done ? "✓" : "○"}</span>
              <span className="text-slate-900">{step.label}</span>
            </div>
            {step.href ? (
              <Link href={step.href} className="text-sm font-medium text-slate-900 hover:underline">{step.cta}</Link>
            ) : (
              <span className="text-sm text-slate-500">{step.cta}</span>
            )}
          </li>
        ))}
      </ul>
      {allComplete && (
        <p className="mt-4 text-sm text-green-700">Setup complete. Manage departments, budgets, and members from the left menu.</p>
      )}
    </div>
  );
}
