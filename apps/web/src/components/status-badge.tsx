const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-zinc-700 dark:text-stone-300",
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  APPROVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  PAID: "bg-emerald-200 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200",
};

const BLOCK_STYLES: Record<string, string> = {
  RECEIPT_REQUIRED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  OVER_BUDGET: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  VENDOR_WALLET_NOT_SET: "bg-slate-200 text-slate-800 dark:bg-zinc-700 dark:text-stone-300",
  VENDOR_INACTIVE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const BLOCK_LABELS: Record<string, string> = {
  RECEIPT_REQUIRED: "Receipt required",
  OVER_BUDGET: "Over budget",
  VENDOR_WALLET_NOT_SET: "Vendor wallet not set",
  VENDOR_INACTIVE: "Vendor inactive",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700 dark:bg-zinc-700 dark:text-stone-300";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {status}
    </span>
  );
}

export function BlockReasonBadge({ reason }: { reason: string }) {
  const style = BLOCK_STYLES[reason] ?? "bg-slate-200 text-slate-800 dark:bg-zinc-700 dark:text-stone-300";
  const label = BLOCK_LABELS[reason] ?? reason;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
