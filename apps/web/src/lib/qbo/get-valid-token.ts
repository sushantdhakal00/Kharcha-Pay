/**
 * Get a valid access token for QBO, refreshing if expired.
 */
import { prisma } from "../db";
import { encrypt, decrypt } from "../encryption";
import { refreshAccessToken } from "./client";

export async function getValidQboAccessToken(
  orgId: string
): Promise<{ accessToken: string; realmId: string } | null> {
  const conn = await prisma.accountingConnection.findUnique({
    where: { orgId_provider: { orgId, provider: "QUICKBOOKS_ONLINE" } },
  });
  if (!conn || conn.status !== "CONNECTED" || !conn.realmId || !conn.accessTokenEncrypted || !conn.refreshTokenEncrypted) {
    return null;
  }
  const now = new Date();
  let accessToken = decrypt(conn.accessTokenEncrypted);
  const refreshToken = decrypt(conn.refreshTokenEncrypted);
  if (conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() - 60_000 < now.getTime()) {
    try {
      const tokens = await refreshAccessToken(refreshToken);
      accessToken = tokens.access_token;
      const expiresAt = new Date(now.getTime() + tokens.expires_in * 1000);
      await prisma.accountingConnection.update({
        where: { id: conn.id },
        data: {
          accessTokenEncrypted: encrypt(tokens.access_token),
          refreshTokenEncrypted: encrypt(tokens.refresh_token),
          tokenExpiresAt: expiresAt,
          errorMessage: null,
        },
      });
    } catch (e) {
      await prisma.accountingConnection.update({
        where: { id: conn.id },
        data: { status: "ERROR", errorMessage: (e as Error).message },
      });
      throw e;
    }
  }
  return { accessToken, realmId: conn.realmId };
}
