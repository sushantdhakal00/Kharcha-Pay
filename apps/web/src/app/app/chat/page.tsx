import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { getActiveOrgWithRole } from "@/lib/get-active-org";
import Link from "next/link";
import { ChatClient } from "./chat-client";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const active = await getActiveOrgWithRole(user);
  if (!active) {
    return (
      <div>
        <p className="text-slate-600 dark:text-slate-300">Create an organization first.</p>
        <Link href="/app/setup" className="mt-2 inline-block text-sm font-medium text-slate-900 hover:underline dark:text-slate-100">
          Go to Setup
        </Link>
      </div>
    );
  }
  const isAdmin = active.role === "ADMIN";
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <ChatClient orgId={active.id} role={active.role} isAdmin={isAdmin} userId={user.id} />
    </div>
  );
}
