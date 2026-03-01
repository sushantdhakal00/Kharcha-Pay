export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-md bg-slate-200 dark:bg-zinc-700 ${className}`}
      style={{
        animation: "skeleton-wave 2s ease-in-out infinite",
      }}
      aria-hidden
    />
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 ${className}`}>
      <SkeletonBlock className="mb-2 h-4 w-24" />
      <SkeletonBlock className="h-8 w-32" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-zinc-700 dark:bg-zinc-800">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/60">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <SkeletonBlock key={i} className="h-4 flex-1" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-zinc-700">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, j) => (
              <SkeletonBlock key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonChart({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 ${className}`}>
      <SkeletonBlock className="mb-4 h-4 w-48" />
      <SkeletonBlock className="mb-2 h-3 w-full" />
      <SkeletonBlock className="mb-2 h-3 w-5/6" />
      <SkeletonBlock className="mb-2 h-3 w-3/4" />
      <SkeletonBlock className="mb-2 h-3 w-full" />
      <SkeletonBlock className="h-32 w-full rounded" />
    </div>
  );
}

export function SkeletonQueueRow() {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-3 dark:border-zinc-800">
      <div className="flex-1">
        <SkeletonBlock className="mb-1 h-4 w-40" />
        <SkeletonBlock className="h-3 w-24" />
      </div>
      <SkeletonBlock className="h-8 w-16 rounded" />
    </div>
  );
}
