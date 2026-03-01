"use client";

import { useState, useEffect } from "react";

export type TimeRangePreset =
  | "today"
  | "last7"
  | "last30"
  | "last90"
  | "thisMonth"
  | "lastMonth"
  | "ytd"
  | "custom";

export interface TimeRangeValue {
  fromISO: string;
  toISO: string;
  bucket: "day" | "week" | "month";
  compare?: "previous_period" | "same_last_month" | "none";
}

const STORAGE_KEY = "kharchapay_dashboard_timerange";

function getStoredRange(orgId: string, userId: string): TimeRangeValue | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${orgId}_${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TimeRangeValue;
    if (parsed.fromISO && parsed.toISO && ["day", "week", "month"].includes(parsed.bucket ?? "")) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function setStoredRange(orgId: string, userId: string, value: TimeRangeValue) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${STORAGE_KEY}_${orgId}_${userId}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function computeRange(preset: TimeRangePreset): TimeRangeValue {
  const now = new Date();
  let from: Date;
  let to = new Date(now);
  to.setHours(23, 59, 59, 999);

  switch (preset) {
    case "today":
      from = new Date(now);
      from.setHours(0, 0, 0, 0);
      break;
    case "last7":
      from = new Date(now);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      break;
    case "last30":
      from = new Date(now);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      break;
    case "last90":
      from = new Date(now);
      from.setDate(from.getDate() - 89);
      from.setHours(0, 0, 0, 0);
      break;
    case "thisMonth":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "lastMonth":
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case "ytd":
      from = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      from = new Date(now);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
  }

  const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const bucket: "day" | "week" | "month" = days <= 31 ? "day" : days <= 90 ? "week" : "month";

  return {
    fromISO: from.toISOString().slice(0, 10),
    toISO: to.toISOString().slice(0, 10),
    bucket,
  };
}

export interface TimeRangePickerProps {
  orgId: string;
  userId: string;
  value: TimeRangeValue;
  onChange: (v: TimeRangeValue) => void;
  className?: string;
}

export function TimeRangePicker({ orgId, userId, value, onChange, className = "" }: TimeRangePickerProps) {
  const [preset, setPreset] = useState<TimeRangePreset>("last30");
  const [customFrom, setCustomFrom] = useState(value.fromISO);
  const [customTo, setCustomTo] = useState(value.toISO);
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    const stored = getStoredRange(orgId, userId);
    if (stored) {
      onChange(stored);
      setCustomFrom(stored.fromISO);
      setCustomTo(stored.toISO);
    } else {
      const initial = computeRange("last30");
      onChange(initial);
      setStoredRange(orgId, userId, initial);
      setCustomFrom(initial.fromISO);
      setCustomTo(initial.toISO);
    }
  }, [orgId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePreset = (p: TimeRangePreset) => {
    setPreset(p);
    setShowCustom(p === "custom");
    if (p !== "custom") {
      const v = computeRange(p);
      onChange(v);
      setStoredRange(orgId, userId, v);
    }
  };

  const handleCustomApply = () => {
    const from = new Date(customFrom + "T00:00:00Z");
    const to = new Date(customTo + "T23:59:59Z");
    if (from > to) return;
    const days = Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const bucket: "day" | "week" | "month" = days <= 31 ? "day" : days <= 90 ? "week" : "month";
    const v = { fromISO: customFrom, toISO: customTo, bucket };
    onChange(v);
    setStoredRange(orgId, userId, v);
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <select
        value={preset}
        onChange={(e) => handlePreset(e.target.value as TimeRangePreset)}
        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      >
        <option value="today">Today</option>
        <option value="last7">Last 7 days</option>
        <option value="last30">Last 30 days</option>
        <option value="last90">Last 90 days</option>
        <option value="thisMonth">This month</option>
        <option value="lastMonth">Last month</option>
        <option value="ytd">YTD</option>
        <option value="custom">Custom</option>
      </select>
      {showCustom && (
        <>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <span className="text-slate-500 dark:text-slate-300">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={handleCustomApply}
            className="rounded bg-slate-900 px-2 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Apply
          </button>
        </>
      )}
    </div>
  );
}
