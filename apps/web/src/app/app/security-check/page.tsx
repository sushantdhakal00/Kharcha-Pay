import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/get-current-user";
import { SecurityCheckClient } from "./security-check-client";

export default async function SecurityCheckPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Security check</h1>
      <p className="mt-1 text-sm text-slate-600">
        Verify CSRF token and re-auth flow (sensitive actions require recent login).
      </p>
      <SecurityCheckClient />
    </div>
  );
}
