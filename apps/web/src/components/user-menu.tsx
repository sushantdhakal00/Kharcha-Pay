"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { fetchWithCsrf, clearCsrfCache } from "@/lib/fetch-with-csrf";
import { useViewAsRole } from "./view-as-role-context";
import { useTourSafe } from "./tours/tour-provider";

function getAvatarSrc(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  if (imageUrl.startsWith("local:")) {
    return "/api/me/avatar";
  }
  return null;
}

function getInitials(username: string): string {
  const parts = username.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return username.slice(0, 2).toUpperCase();
}

export function UserMenu({
  username,
  email,
  imageUrl,
  orgName,
  orgRole,
}: {
  username: string;
  email: string;
  imageUrl: string | null | undefined;
  orgName: string | null;
  orgRole: string;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localImageUrl, setLocalImageUrl] = useState(imageUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalImageUrl(imageUrl);
  }, [imageUrl]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetchWithCsrf("/api/me/avatar", {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        setLocalImageUrl("local:uploaded");
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Upload failed");
      }
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const avatarSrc = getAvatarSrc(localImageUrl);
  const viewAs = useViewAsRole();
  const tour = useTourSafe();
  const [tourReset, setTourReset] = useState(false);

  async function handleLogout() {
    await fetchWithCsrf("/api/auth/logout", { method: "POST" });
    clearCsrfCache();
    try { localStorage.removeItem("kharchapay_view_as_role"); } catch {}
    window.location.href = "/?_t=" + Date.now();
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full p-1 pr-2 text-left hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 dark:hover:bg-zinc-700 dark:focus:ring-zinc-500 dark:focus:ring-offset-[#1E1E22]"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-slate-200 ring-2 ring-white dark:bg-zinc-700 dark:ring-zinc-800">
          {avatarSrc ? (
            <Image
              src={avatarSrc}
              alt=""
              fill
              className="object-cover"
              sizes="32px"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-600 dark:text-stone-300">
              {getInitials(username)}
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-slate-900/50 text-white">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </span>
          )}
        </div>
        <span className="max-w-[120px] truncate text-sm font-medium text-slate-700 sm:max-w-[140px] dark:text-stone-300">
          {username}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-stone-400 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white py-2 shadow-xl dark:border-zinc-700 dark:bg-zinc-800">
          {/* Header with avatar and basic info */}
          <div className="border-b border-slate-100 px-4 pb-3 pt-2 dark:border-zinc-700">
            <div className="flex items-center gap-3">
              <label className="relative cursor-pointer">
                <div className="relative h-14 w-14 overflow-hidden rounded-full bg-slate-200 ring-2 ring-slate-100 dark:bg-zinc-700 dark:ring-zinc-600">
                  {avatarSrc ? (
                    <Image
                      src={avatarSrc}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-slate-600 dark:text-stone-300">
                      {getInitials(username)}
                    </span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleAvatarChange}
                  disabled={uploading}
                />
                <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-white shadow-md hover:bg-slate-600 dark:bg-zinc-600 dark:hover:bg-zinc-500">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                </span>
              </label>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900 dark:text-stone-100">{username}</p>
                <p className="truncate text-sm text-slate-500 dark:text-stone-400">{email}</p>
              </div>
            </div>
          </div>

          {/* Org info */}
          {orgName && (
            <div className="border-b border-slate-100 px-4 py-2 dark:border-zinc-700">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-stone-500">
                Current organization
              </p>
              <p className="font-medium text-slate-900 dark:text-stone-100">{orgName}</p>
              <p className="text-sm text-slate-500 capitalize dark:text-stone-400">{orgRole.toLowerCase()}</p>
            </div>
          )}

          {/* View as role (Admin only) */}
          {orgRole === "ADMIN" && viewAs && (
            <div className="border-b border-slate-100 px-4 py-2 dark:border-zinc-700">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-stone-500 mb-2">
                View as role
              </p>
              <select
                value={viewAs.viewAsRole ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  viewAs.setViewAsRole(v ? (v as "ADMIN" | "APPROVER" | "STAFF" | "AUDITOR") : null);
                }}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-200"
              >
                <option value="">Actual role (Admin)</option>
                <option value="APPROVER">Approver</option>
                <option value="STAFF">Staff</option>
                <option value="AUDITOR">Auditor</option>
              </select>
            </div>
          )}

          {/* Menu items */}
          <div className="py-1">
            <Link
              href="/app/setup"
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-stone-300 dark:hover:bg-zinc-700"
              onClick={() => setOpen(false)}
            >
              <svg className="h-5 w-5 text-slate-400 dark:text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Setup & organizations
            </Link>
            {tour && (
              <button
                type="button"
                onClick={() => {
                  tour.resetTours();
                  setTourReset(true);
                  setTimeout(() => setTourReset(false), 2000);
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-stone-300 dark:hover:bg-zinc-700"
              >
                <svg className="h-5 w-5 text-slate-400 dark:text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {tourReset ? "Tours reset!" : "Reset product tours"}
              </button>
            )}
            <div className="mt-1 border-t border-slate-100 pt-1 dark:border-zinc-700">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 dark:text-stone-300 dark:hover:bg-zinc-700"
              >
                <svg className="h-5 w-5 text-slate-400 dark:text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
