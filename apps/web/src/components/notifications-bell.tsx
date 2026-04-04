"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNotifications();
    const t = setInterval(fetchNotifications, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  async function markReadAndGo(id: string, link: string | null) {
    await fetchWithCsrf(`/api/notifications/${id}/read`, { method: "POST" });
    setUnreadCount((c) => Math.max(0, c - 1));
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setOpen(false);
    if (link) window.location.href = link;
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-50"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 6v-1a3 3 0 00-6 0v1m6-3h-1" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-80 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
          <div className="border-b border-slate-200 px-3 py-2 dark:border-zinc-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="p-3 text-sm text-slate-500 dark:text-slate-300">Loading…</p>
            ) : notifications.length === 0 ? (
              <p className="p-3 text-sm text-slate-500 dark:text-slate-300">No notifications</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markReadAndGo(n.id, n.link)}
                  className={`w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50 dark:border-zinc-700 dark:hover:bg-zinc-700 ${!n.readAt ? "bg-slate-50/50 dark:bg-zinc-700/30" : ""}`}
                >
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">{new Date(n.createdAt).toLocaleDateString()}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
