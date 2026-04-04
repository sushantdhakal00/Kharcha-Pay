import { prisma } from "./db";
import { getTokenFromCookie, verifyToken } from "./auth";
import type { ApiUser } from "@kharchapay/shared";

export async function getCurrentUser(): Promise<ApiUser | null> {
  const token = await getTokenFromCookie();
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, username: true, displayName: true, imageUrl: true, createdAt: true, jwtVersion: true },
  });
  if (!user || user.jwtVersion !== payload.jwtVersion) return null;
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName ?? null,
    imageUrl: user.imageUrl ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
