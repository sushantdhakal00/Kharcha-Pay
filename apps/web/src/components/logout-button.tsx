"use client";

import { useRouter } from "next/navigation";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetchWithCsrf("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="text-sm font-medium text-slate-600 hover:text-slate-900"
    >
      Log out
    </button>
  );
}
