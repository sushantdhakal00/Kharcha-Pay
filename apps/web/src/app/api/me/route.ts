import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/get-current-user";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const patchMeSchema = z.object({
  imageUrl: z
    .union([
      z.string().url("Invalid image URL").refine((url) => url.startsWith("https://") || url.startsWith("http://"), "Must be http(s) URL"),
      z.null(),
    ])
    .optional(),
  displayName: z.string().max(100).nullable().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ user });
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    await requireCsrf(request);

    const body = await request.json().catch(() => ({}));
    const parsed = patchMeSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors?.[0]?.message ?? "Validation failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const { imageUrl, displayName } = parsed.data;
    const updates: { imageUrl?: string | null; displayName?: string | null } = {};
    if (imageUrl !== undefined) updates.imageUrl = imageUrl;
    if (displayName !== undefined) updates.displayName = displayName;

    await prisma.user.update({
      where: { id: user.id },
      data: updates,
    });

    return NextResponse.json({
      user: {
        ...user,
        ...updates,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
