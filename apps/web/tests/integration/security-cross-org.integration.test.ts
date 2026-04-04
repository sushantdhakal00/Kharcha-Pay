/**
 * Integration tests: Cross-org authorization + demo safety.
 * Proves cross-org receipt/export/reconcile are denied; demo reset cannot target non-demo org.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    membership: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}));

describe("Cross-org access denied", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requireOrgReadAccess returns 403 when user is not member of org", async () => {
    const { requireOrgReadAccess } = await import("@/lib/require-org-role");
    const { prisma } = await import("@/lib/db");

    vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);

    let caught: unknown;
    try {
      await requireOrgReadAccess("org-other", "user-from-org-a");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    const res = caught as Response;
    expect(res.status).toBe(403);
  });

  it("requireOrgReadAccess returns membership when user is member", async () => {
    const { requireOrgReadAccess } = await import("@/lib/require-org-role");
    const { prisma } = await import("@/lib/db");

    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      orgId: "org1",
      userId: "user1",
      role: "STAFF",
    } as never);

    const result = await requireOrgReadAccess("org1", "user1");
    expect(result).toEqual({ orgId: "org1", userId: "user1", role: "STAFF" });
  });
});

describe("Demo reset cannot target non-demo org", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seedDemoOrg throws when org is not demo", async () => {
    const { seedDemoOrg } = await import("@/lib/demo-seed");
    const { prisma } = await import("@/lib/db");

    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      id: "org1",
      isDemo: false,
      demoOwnerUserId: "user1",
      memberships: [],
    } as never);

    await expect(
      seedDemoOrg({ orgId: "org1", demoOwnerUserId: "user1", actorUserId: "user1" })
    ).rejects.toThrow(/Demo seed guard/);
  });

  it("seedDemoOrg throws when demo owner mismatch", async () => {
    const { seedDemoOrg } = await import("@/lib/demo-seed");
    const { prisma } = await import("@/lib/db");

    vi.mocked(prisma.organization.findUnique).mockResolvedValue({
      id: "org1",
      isDemo: true,
      demoOwnerUserId: "owner-user",
      memberships: [],
    } as never);

    await expect(
      seedDemoOrg({ orgId: "org1", demoOwnerUserId: "other-user", actorUserId: "other-user" })
    ).rejects.toThrow(/Demo seed guard/);
  });

  it("seedDemoOrg throws when org does not exist", async () => {
    const { seedDemoOrg } = await import("@/lib/demo-seed");
    const { prisma } = await import("@/lib/db");

    vi.mocked(prisma.organization.findUnique).mockResolvedValue(null);

    await expect(
      seedDemoOrg({ orgId: "nonexistent", demoOwnerUserId: "user1", actorUserId: "user1" })
    ).rejects.toThrow(/Demo seed guard/);
  });
});
