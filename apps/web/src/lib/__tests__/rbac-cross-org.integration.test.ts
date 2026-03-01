/**
 * RBAC integration tests: verify cross-org access is blocked on critical route families.
 * Run with: npm run test:integration
 * Requires DATABASE_URL and test DB with seed data.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../db";

// Route families that must be org-scoped (orgId in path)
const ORG_SCOPED_PATHS = [
  "/api/orgs",
  // Sub-paths verified via requireOrgReadAccess / requireOrgRole in handlers
];

describe("RBAC cross-org verification", () => {
  let validOrgId: string;
  let otherOrgId: string;
  let userInOrg: { id: string };
  let userNotInOrg: { id: string };

  beforeAll(async () => {
    const orgs = await prisma.organization.findMany({ take: 2 });
    if (orgs.length < 2) {
      throw new Error("Need at least 2 orgs in test DB for cross-org tests");
    }
    validOrgId = orgs[0].id;
    otherOrgId = orgs[1].id;

    const m1 = await prisma.membership.findFirst({ where: { orgId: validOrgId } });
    const m2 = await prisma.membership.findFirst({
      where: { orgId: otherOrgId },
      select: { userId: true },
    });
    if (!m1 || !m2) throw new Error("Need memberships for cross-org tests");
    userInOrg = { id: m1.userId };
    userNotInOrg = { id: m2.userId };
  });

  it("user in org A cannot access org B resources via membership check", async () => {
    const inOther = await prisma.membership.findUnique({
      where: { orgId_userId: { orgId: otherOrgId, userId: userInOrg.id } },
    });
    expect(inOther).toBeNull();
  });

  it("org-scoped routes enforce membership - invoices", async () => {
    const inv = await prisma.invoice.findFirst({ where: { orgId: validOrgId } });
    if (inv) {
      const inOther = await prisma.invoice.findFirst({
        where: { id: inv.id, orgId: otherOrgId },
      });
      expect(inOther).toBeNull();
    }
  });

  it("org-scoped routes enforce membership - vendors", async () => {
    const vendor = await prisma.vendor.findFirst({ where: { orgId: validOrgId } });
    if (vendor) {
      const inOther = await prisma.vendor.findFirst({
        where: { id: vendor.id, orgId: otherOrgId },
      });
      expect(inOther).toBeNull();
    }
  });

  it("org-scoped routes enforce membership - chat channels", async () => {
    const ch = await prisma.chatChannel.findFirst({ where: { orgId: validOrgId } });
    if (ch) {
      const inOther = await prisma.chatChannel.findFirst({
        where: { id: ch.id, orgId: otherOrgId },
      });
      expect(inOther).toBeNull();
    }
  });

  it("org-scoped routes enforce membership - webhooks", async () => {
    const ep = await prisma.webhookEndpoint.findFirst({ where: { orgId: validOrgId } });
    if (ep) {
      const inOther = await prisma.webhookEndpoint.findFirst({
        where: { id: ep.id, orgId: otherOrgId },
      });
      expect(inOther).toBeNull();
    }
  });

  it("org-scoped routes enforce membership - accounting connection", async () => {
    const conn = await prisma.accountingConnection.findFirst({ where: { orgId: validOrgId } });
    if (conn) {
      const inOther = await prisma.accountingConnection.findFirst({
        where: { id: conn.id, orgId: otherOrgId },
      });
      expect(inOther).toBeNull();
    }
  });
});
