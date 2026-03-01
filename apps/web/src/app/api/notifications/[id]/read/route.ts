import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { markRead } from "@/lib/notifications";

/**
 * POST /api/notifications/[id]/read – mark notification as read (current user only)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(request);
    const { id } = await params;

    const ok = await markRead(id, user.id);
    if (!ok) {
      return NextResponse.json({ error: "Notification not found or already read" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
