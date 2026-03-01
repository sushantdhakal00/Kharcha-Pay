/**
 * In-app notifications (no email). Create, mark read, get unread count.
 */
import { prisma } from "./db";

export type NotificationType =
  | "REQUEST_SUBMITTED"
  | "REQUEST_APPROVED"
  | "REQUEST_REJECTED"
  | "REQUEST_PAID"
  | "REQUEST_NEEDS_APPROVAL";

export interface CreateNotificationParams {
  orgId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  await prisma.notification.create({
    data: {
      orgId: params.orgId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link ?? null,
    },
  });
}

export async function markRead(notificationId: string, userId: string): Promise<boolean> {
  const n = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!n || n.readAt) return false;
  await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
  return true;
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}
