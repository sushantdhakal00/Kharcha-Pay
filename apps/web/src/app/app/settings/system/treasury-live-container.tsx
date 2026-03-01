"use client";

import { useTreasuryStream } from "./use-treasury-stream";

export function TreasuryLiveContainer({ orgId }: { orgId: string }) {
  const { connected, lastEvent, reconnect } = useTreasuryStream(orgId);

  return (
    <div className="mt-3 flex items-center gap-3 text-xs">
      <span className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            connected ? "bg-green-500 animate-pulse" : "bg-red-400"
          }`}
        />
        <span className={connected ? "text-green-700" : "text-red-600"}>
          {connected ? "Live" : "Offline"}
        </span>
      </span>
      {!connected && (
        <button
          type="button"
          onClick={reconnect}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Reconnect
        </button>
      )}
      {lastEvent && (
        <span className="text-slate-400 truncate max-w-[300px]">
          Last: {lastEvent.type} at{" "}
          {new Date(lastEvent.createdAt).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
