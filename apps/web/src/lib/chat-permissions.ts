/**
 * Chat channel permissions: RBAC per channel (canView, canSend, canManageChannel, etc.)
 */
import type { OrgRole } from "@prisma/client";
import type { ChatChannelPermission } from "@prisma/client";

export type ChannelPerms = {
  canView: boolean;
  canSend: boolean;
  canManageChannel: boolean;
  canManageMessages: boolean;
  canPin: boolean;
  canUpload: boolean;
};

/** Get permission flags for a role from channel permissions. Falls back to defaults for #general. */
export function getPermsForRole(
  perms: Pick<ChatChannelPermission, "role" | "canView" | "canSend" | "canManageChannel" | "canManageMessages" | "canPin" | "canUpload">[],
  role: OrgRole
): ChannelPerms {
  const p = perms.find((x) => x.role === role);
  if (p) {
    return {
      canView: p.canView,
      canSend: p.canSend,
      canManageChannel: p.canManageChannel,
      canManageMessages: p.canManageMessages,
      canPin: p.canPin,
      canUpload: p.canUpload,
    };
  }
  // Default: all roles can view + send (like #general)
  return {
    canView: true,
    canSend: true,
    canManageChannel: role === "ADMIN",
    canManageMessages: role === "ADMIN" || role === "APPROVER",
    canPin: role === "ADMIN" || role === "APPROVER",
    canUpload: true,
  };
}

/** Slug-safe channel name: lowercase, alphanumeric + hyphens */
export function slugifyChannelName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
