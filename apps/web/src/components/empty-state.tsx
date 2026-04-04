import Link from "next/link";

type EmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: React.ReactNode;
  variant?: "default" | "chart" | "queue" | "setup";
};

const VARIANTS = {
  default: "rounded-lg border border-slate-200 bg-slate-50 p-6 text-center dark:border-zinc-700 dark:bg-zinc-800/50",
  chart: "rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center min-h-[240px] flex flex-col items-center justify-center dark:border-zinc-600 dark:bg-zinc-800/30",
  queue: "rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center dark:border-zinc-600 dark:bg-zinc-800/30",
  setup: "rounded-lg border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950/30",
};

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  icon,
  variant = "default",
}: EmptyStateProps) {
  return (
    <div className={VARIANTS[variant]}>
      {icon && <div className="mb-3 text-slate-400 dark:text-zinc-500">{icon}</div>}
      <p className="font-medium text-slate-700 dark:text-stone-300">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500 dark:text-stone-500">{description}</p>}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-4 inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-stone-100 dark:text-zinc-900 dark:hover:bg-stone-200"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

const CHART_ICON = (
  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h8V3H3v10zm10 8h8v-6h-8v6zm0-8h8V3h-8v10z" />
  </svg>
);

const INBOX_ICON = (
  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
  </svg>
);

const COG_ICON = (
  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

export function ChartEmptyState({
  role,
  rangeLabel,
  actionHref,
  actionLabel,
}: {
  role: "ADMIN" | "APPROVER" | "STAFF" | "AUDITOR";
  rangeLabel?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const messages: Record<string, { title: string; desc: string }> = {
    STAFF: { title: "No requests in this range", desc: "Create your first request to see activity." },
    APPROVER: { title: "No approvals needed in this range", desc: "" },
    ADMIN: { title: "No spend activity in this range", desc: "" },
    AUDITOR: { title: "No payments recorded in this range", desc: "" },
  };
  const { title, desc } = messages[role] ?? { title: "No data", desc: "" };
  return (
    <EmptyState
      variant="chart"
      title={title}
      description={rangeLabel ? `${desc} ${rangeLabel}`.trim() || rangeLabel : desc}
      actionLabel={actionLabel}
      actionHref={actionHref}
      icon={CHART_ICON}
    />
  );
}

export function QueueEmptyState({
  type,
  actionHref,
  actionLabel,
}: {
  type: "drafts" | "pending" | "approvals" | "paymentsReady" | "policyBlocked";
  actionHref?: string;
  actionLabel?: string;
}) {
  const messages: Record<string, { title: string; desc: string }> = {
    drafts: { title: "No drafts", desc: "Start a request when you're ready." },
    pending: { title: "No pending requests", desc: "" },
    approvals: { title: "Nothing to approve", desc: "All caught up." },
    paymentsReady: { title: "No approved requests ready to pay", desc: "" },
    policyBlocked: { title: "No payment blockers detected", desc: "All approved requests pass policy checks." },
  };
  const { title, desc } = messages[type] ?? { title: "Empty", desc: "" };
  return (
    <EmptyState
      variant="queue"
      title={title}
      description={desc}
      actionLabel={actionLabel}
      actionHref={actionHref}
      icon={INBOX_ICON}
    />
  );
}

export function DepartmentsEmptyState() {
  return (
    <EmptyState
      variant="setup"
      title="Finish setup"
      description="Add departments and budgets to see budget vs spend."
      actionLabel="Go to setup"
      actionHref="/app/setup"
      icon={COG_ICON}
    />
  );
}
