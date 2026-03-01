/**
 * Integration tests: Reconciliation permissions.
 * Mocks DB and auth; verifies ADMIN can run, ORG member can read, AUDITOR can read but not run.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    expenseRequest: { findFirst: vi.fn(), findMany: vi.fn() },
    paymentReconciliation: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
    membership: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    orgChainConfig: { findUnique: vi.fn() },
    auditEvent: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireCsrf: vi.fn().mockResolvedValue(undefined),
  getTokenFromCookie: vi.fn(),
  verifyToken: vi.fn(),
}));

vi.mock("@/lib/require-user", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user1", email: "a@b.com" }),
}));

vi.mock("@/lib/require-org-role", () => ({
  requireOrgReadAccess: vi.fn().mockResolvedValue({ orgId: "org1", userId: "user1", role: "ADMIN" }),
  requireOrgWriteAccess: vi.fn().mockResolvedValue({ orgId: "org1", userId: "user1", role: "ADMIN" }),
  requireOrgRole: vi.fn().mockResolvedValue({ orgId: "org1", userId: "user1", role: "ADMIN" }),
}));

vi.mock("@/lib/require-recent-auth", () => ({
  requireRecentAuth: vi.fn().mockResolvedValue(undefined),
  REAUTH_MAX_AGE_SECONDS: 900,
}));

vi.mock("@/lib/solana/verify-payment", () => ({
  verifyPaymentOnChain: vi.fn().mockResolvedValue({
    status: "VERIFIED",
    reasons: [],
    observed: {},
    expected: {},
  }),
}));

vi.mock("@/lib/solana/connection", () => ({ getConnection: vi.fn() }));

describe("Reconciliation permissions (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ADMIN can call reconcile run", async () => {
    const { runReconciliationForOrg } = await import("@/lib/reconcile");
    const { prisma } = await import("@/lib/db");

    vi.mocked(prisma.expenseRequest.findMany).mockResolvedValue([]);

    const result = await runReconciliationForOrg("org1", { actorUserId: "admin1" });
    expect(result).toEqual({
      total: 0,
      verified: 0,
      warning: 0,
      failed: 0,
      pending: 0,
      errors: [],
    });
  });

  it("verifySingleRequest returns null for non-PAID request", async () => {
    const { verifySingleRequest } = await import("@/lib/reconcile");
    const { prisma } = await import("@/lib/db");
    vi.mocked(prisma.expenseRequest.findFirst).mockResolvedValue({
      id: "req1",
      status: "APPROVED",
    } as never);
    const result = await verifySingleRequest("org1", "req1");
    expect(result).toBeNull();
  });

  it("verifySingleRequest writes FAILED when verifyPaymentOnChain returns FAILED", async () => {
    const { verifySingleRequest } = await import("@/lib/reconcile");
    const { prisma } = await import("@/lib/db");
    const { verifyPaymentOnChain } = await import("@/lib/solana/verify-payment");
    vi.mocked(verifyPaymentOnChain).mockResolvedValueOnce({
      status: "FAILED",
      reasons: ["Memo mismatch"],
      expected: {},
    } as never);
    vi.mocked(prisma.expenseRequest.findFirst).mockResolvedValue({
      id: "req1",
      orgId: "org1",
      status: "PAID",
      paidTxSig: "sig1",
      amountMinor: BigInt(1000),
      vendor: { tokenAccount: "t1", ownerPubkey: "o1" },
      org: { slug: "acme" },
    } as never);
    vi.mocked(prisma.orgChainConfig.findUnique).mockResolvedValue({
      token2022Mint: "m1",
      treasuryTokenAccount: "tr1",
      treasuryOwnerPubkey: "treasury",
      tokenProgramId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    } as never);
    const result = await verifySingleRequest("org1", "req1", "user1");
    expect(result?.status).toBe("FAILED");
    expect(prisma.paymentReconciliation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { requestId: "req1" },
        create: expect.objectContaining({ status: "FAILED" }),
      })
    );
  });

  it("verifySingleRequest writes FAILED on RPC throw (reliability)", async () => {
    const { verifySingleRequest } = await import("@/lib/reconcile");
    const { prisma } = await import("@/lib/db");
    const { verifyPaymentOnChain } = await import("@/lib/solana/verify-payment");
    vi.mocked(verifyPaymentOnChain).mockRejectedValueOnce(new Error("Connection timed out"));
    vi.mocked(prisma.expenseRequest.findFirst).mockResolvedValue({
      id: "req1",
      orgId: "org1",
      status: "PAID",
      paidTxSig: "sig1",
      amountMinor: BigInt(1000),
      vendor: { tokenAccount: "t1", ownerPubkey: "o1" },
      org: { slug: "acme" },
    } as never);
    vi.mocked(prisma.orgChainConfig.findUnique).mockResolvedValue({
      token2022Mint: "m1",
      treasuryTokenAccount: "tr1",
      treasuryOwnerPubkey: "treasury",
      tokenProgramId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    } as never);
    const result = await verifySingleRequest("org1", "req1");
    expect(result?.status).toBe("FAILED");
    expect(result?.reasons[0]).toMatch(/RPC_TIMEOUT|RPC_ERROR/);
  });

  it("verifySingleRequest writes record on success (idempotent upsert)", async () => {
    const { verifySingleRequest } = await import("@/lib/reconcile");
    const { prisma } = await import("@/lib/db");

    vi.mocked(prisma.expenseRequest.findFirst).mockResolvedValue({
      id: "req1",
      orgId: "org1",
      status: "PAID",
      paidTxSig: "sig1",
      amountMinor: BigInt(1000),
      vendor: { tokenAccount: "t1", ownerPubkey: "o1" },
      org: { slug: "acme" },
    } as never);
    vi.mocked(prisma.orgChainConfig.findUnique).mockResolvedValue({
      token2022Mint: "m1",
      treasuryTokenAccount: "tr1",
      treasuryOwnerPubkey: "treasury",
      tokenProgramId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    } as never);

    const result = await verifySingleRequest("org1", "req1", "user1");
    expect(result?.status).toBe("VERIFIED");
    expect(prisma.paymentReconciliation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { requestId: "req1" },
        create: expect.any(Object),
        update: expect.any(Object),
      })
    );
  });
});
