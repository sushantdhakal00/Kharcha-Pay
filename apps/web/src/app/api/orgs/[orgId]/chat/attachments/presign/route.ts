import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireCsrf } from "@/lib/auth";
import { SignJWT } from "jose";
import { randomBytes } from "crypto";
import { env } from "@/lib/env";
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ALLOWED_MIME_TYPES,
} from "@/lib/chat-attachment-upload";
import { getChannelWithAuth } from "@/lib/chat-auth";

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);
const UPLOAD_TOKEN_EXPIRY_SEC = 15 * 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    await requireCsrf(req);
    const { orgId } = await params;

    const body = await req.json().catch(() => ({}));
    const channelId = String(body.channelId ?? "").trim();
    const fileName = String(body.fileName ?? "").trim();
    const mimeType = String(body.mimeType ?? "").trim().toLowerCase();
    const sizeBytes = Number(body.sizeBytes) || 0;

    if (!channelId) {
      return NextResponse.json({ error: "channelId required" }, { status: 400 });
    }

    const auth = await getChannelWithAuth(orgId, channelId, user.id);
    if (!auth) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    if (!auth.perms.canUpload) {
      return NextResponse.json({ error: "Forbidden: cannot upload" }, { status: 403 });
    }

    if (!fileName) {
      return NextResponse.json({ error: "fileName required" }, { status: 400 });
    }
    if (sizeBytes <= 0 || sizeBytes > CHAT_ATTACHMENT_MAX_BYTES) {
      return NextResponse.json(
        { error: `sizeBytes must be 1–${CHAT_ATTACHMENT_MAX_BYTES}` },
        { status: 400 }
      );
    }
    if (!CHAT_ALLOWED_MIME_TYPES.includes(mimeType as (typeof CHAT_ALLOWED_MIME_TYPES)[number])) {
      return NextResponse.json(
        { error: "mimeType must be application/pdf, image/jpeg, image/png, or image/webp" },
        { status: 400 }
      );
    }

    const storageKey = randomBytes(16).toString("hex") + "-" + Date.now();
    const payload = {
      orgId,
      channelId,
      storageKey,
      fileName: fileName.slice(0, 255),
      mimeType,
      sizeBytes,
      userId: user.id,
    };
    const uploadToken = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${UPLOAD_TOKEN_EXPIRY_SEC}s`)
      .sign(JWT_SECRET);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const uploadUrl = `${baseUrl}/api/orgs/${orgId}/chat/attachments/upload`;

    return NextResponse.json({
      uploadUrl,
      storageKey,
      requiredHeaders: {
        "Content-Type": mimeType,
        "X-Upload-Token": uploadToken,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
