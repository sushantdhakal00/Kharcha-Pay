/**
 * Deterministic demo seed for per-user demo orgs.
 * Only call when org.isDemo === true and org.demoOwnerUserId === currentUser.id.
 */
import { prisma } from "./db";
import * as argon2 from "argon2";
import {
  OrgRole,
  RequestStatus,
  VendorStatus,
  PaymentVerificationStatus,
} from "@prisma/client";
import { logAuditEvent } from "./audit";

export const DEMO_SEED_VERSION = 1;

const DEMO_PASSWORD = "demo-password-8";

async function getOrCreateDemoUser(
  email: string,
  username: string
): Promise<string> {
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const hash = await argon2.hash(DEMO_PASSWORD);
    user = await prisma.user.create({
      data: { email, username, password: hash },
    });
  }
  return user.id;
}

export interface SeedDemoInput {
  orgId: string;
  demoOwnerUserId: string;
  actorUserId: string;
  /** When true, delete existing demo data before seeding (e.g. version change) */
  forceReseed?: boolean;
}

export async function seedDemoOrg(input: SeedDemoInput): Promise<void> {
  const { orgId, demoOwnerUserId, actorUserId, forceReseed } = input;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { memberships: true },
  });
  if (!org || !org.isDemo || org.demoOwnerUserId !== demoOwnerUserId) {
    throw new Error("Demo seed guard: org must be demo and owned by user");
  }

  if (forceReseed) {
    await prisma.$transaction([
      prisma.paymentReconciliation.deleteMany({ where: { orgId } }),
      prisma.receiptFile.deleteMany({ where: { request: { orgId } } }),
      prisma.approvalAction.deleteMany({ where: { request: { orgId } } }),
      prisma.expenseRequest.deleteMany({ where: { orgId } }),
      prisma.monthlyBudget.deleteMany({ where: { orgId } }),
      prisma.department.deleteMany({ where: { orgId } }),
      prisma.vendor.deleteMany({ where: { orgId } }),
      prisma.auditEvent.deleteMany({ where: { orgId } }),
      prisma.notification.deleteMany({ where: { orgId } }),
      prisma.orgSpendPolicy.deleteMany({ where: { orgId } }),
      prisma.approvalTier.deleteMany({ where: { policy: { orgId } } }),
      prisma.approvalPolicy.deleteMany({ where: { orgId } }),
    ]);
  }

  const [
    approver1Id,
    approver2Id,
    auditorId,
    requesterId,
  ] = await Promise.all([
    getOrCreateDemoUser("demo-approver-1@demo.kharchapay.local", "demo-approver-1"),
    getOrCreateDemoUser("demo-approver-2@demo.kharchapay.local", "demo-approver-2"),
    getOrCreateDemoUser("demo-auditor@demo.kharchapay.local", "demo-auditor"),
    getOrCreateDemoUser("demo-requester@demo.kharchapay.local", "demo-requester"),
  ]);

  const existingMemberIds = new Set(org.memberships.map((m) => m.userId));
  const toAdd = [
    { userId: approver1Id, role: OrgRole.APPROVER },
    { userId: approver2Id, role: OrgRole.APPROVER },
    { userId: auditorId, role: OrgRole.AUDITOR },
    { userId: requesterId, role: OrgRole.STAFF },
  ].filter(({ userId }) => !existingMemberIds.has(userId));

  for (const { userId, role } of toAdd) {
    await prisma.membership.create({
      data: { orgId, userId, role },
    });
  }

  const deptNames = ["Engineering", "Operations", "Finance"];
  const departments: { id: string; name: string }[] = [];
  for (const name of deptNames) {
    const dept = await prisma.department.upsert({
      where: { orgId_name: { orgId, name } },
      create: { orgId, name },
      update: {},
    });
    departments.push({ id: dept.id, name: dept.name });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  for (const dept of departments) {
    await prisma.monthlyBudget.upsert({
      where: {
        departmentId_year_month: { departmentId: dept.id, year, month },
      },
      create: {
        orgId,
        departmentId: dept.id,
        year,
        month,
        amountMinor: BigInt(150_000_00),
        currency: "NPR",
      },
      update: {},
    });
  }

  const engDept = departments[0]!;
  const opsDept = departments[1]!;

  const vendors = await Promise.all([
    prisma.vendor.upsert({
      where: { orgId_name: { orgId, name: "Active Vendor Co" } },
      create: {
        orgId,
        name: "Active Vendor Co",
        status: VendorStatus.ACTIVE,
        ownerPubkey: "11111111111111111111111111111111",
        tokenAccount: null,
      },
      update: {},
    }),
    prisma.vendor.upsert({
      where: { orgId_name: { orgId, name: "Draft Vendor Inc" } },
      create: {
        orgId,
        name: "Draft Vendor Inc",
        status: VendorStatus.DRAFT,
      },
      update: {},
    }),
    prisma.vendor.upsert({
      where: { orgId_name: { orgId, name: "Archived Vendor Ltd" } },
      create: {
        orgId,
        name: "Archived Vendor Ltd",
        status: VendorStatus.ARCHIVED,
      },
      update: {},
    }),
  ]);

  const activeVendor = vendors[0]!;
  const draftVendor = vendors[1]!;

  const approvalPolicy = await prisma.approvalPolicy.upsert({
    where: { orgId },
    create: { orgId },
    update: {},
  });

  await prisma.approvalTier.deleteMany({ where: { policyId: approvalPolicy.id } });
  await prisma.approvalTier.createMany({
    data: [
      { policyId: approvalPolicy.id, minAmountMinor: BigInt(0), requiredApprovals: 1 },
      { policyId: approvalPolicy.id, minAmountMinor: BigInt(50_000_00), requiredApprovals: 2 },
    ],
  });

  await prisma.orgSpendPolicy.upsert({
    where: { orgId },
    create: {
      orgId,
      requireReceiptForPayment: true,
      receiptRequiredAboveMinor: BigInt(0),
      blockOverBudget: true,
      allowAdminOverrideOverBudget: true,
    },
    update: {
      requireReceiptForPayment: true,
      receiptRequiredAboveMinor: BigInt(0),
      blockOverBudget: true,
      allowAdminOverrideOverBudget: true,
    },
  });

  const existingCount = await prisma.expenseRequest.count({ where: { orgId } });
  if (existingCount > 0) return;

  const req1 = await prisma.expenseRequest.create({
    data: {
      orgId,
      departmentId: engDept.id,
      vendorId: activeVendor.id,
      requesterUserId: requesterId,
      title: "Office supplies",
      purpose: "Pens, paper, staplers",
      category: "Supplies",
      amountMinor: BigInt(5_000_00),
      currency: "NPR",
      status: RequestStatus.DRAFT,
      requiredApprovals: 1,
    },
  });

  const req2 = await prisma.expenseRequest.create({
    data: {
      orgId,
      departmentId: engDept.id,
      vendorId: activeVendor.id,
      requesterUserId: demoOwnerUserId,
      title: "Conference tickets",
      purpose: "Team summit registration",
      category: "Travel",
      amountMinor: BigInt(25_000_00),
      currency: "NPR",
      status: RequestStatus.PENDING,
      requiredApprovals: 2,
      submittedAt: new Date(),
    },
  });

  await prisma.approvalAction.create({
    data: { requestId: req2.id, actorUserId: approver1Id, decision: "APPROVE", note: "Approved" },
  });

  const req3 = await prisma.expenseRequest.create({
    data: {
      orgId,
      departmentId: engDept.id,
      vendorId: activeVendor.id,
      requesterUserId: requesterId,
      title: "Cloud hosting",
      purpose: "Monthly AWS bill",
      category: "Infrastructure",
      amountMinor: BigInt(15_000_00),
      currency: "NPR",
      status: RequestStatus.APPROVED,
      requiredApprovals: 1,
      submittedAt: new Date(Date.now() - 86400000),
      decidedAt: new Date(),
    },
  });
  await prisma.approvalAction.create({
    data: { requestId: req3.id, actorUserId: approver1Id, decision: "APPROVE" },
  });

  const req4 = await prisma.expenseRequest.create({
    data: {
      orgId,
      departmentId: engDept.id,
      vendorId: activeVendor.id,
      requesterUserId: requesterId,
      title: "Training materials",
      purpose: "Online course licenses",
      category: "Education",
      amountMinor: BigInt(8_000_00),
      currency: "NPR",
      status: RequestStatus.REJECTED,
      requiredApprovals: 1,
      submittedAt: new Date(Date.now() - 172800000),
      decidedAt: new Date(),
    },
  });
  await prisma.approvalAction.create({
    data: { requestId: req4.id, actorUserId: approver1Id, decision: "REJECT", note: "Out of scope" },
  });

  const req5Verified = await prisma.expenseRequest.create({
    data: {
      orgId,
      departmentId: engDept.id,
      vendorId: activeVendor.id,
      requesterUserId: requesterId,
      title: "Software license (VERIFIED demo)",
      purpose: "Annual license - demo shows verified reconciliation",
      category: "Software",
      amountMinor: BigInt(10_000_00),
      currency: "NPR",
      status: RequestStatus.PAID,
      requiredApprovals: 1,
      submittedAt: new Date(Date.now() - 259200000),
      decidedAt: new Date(),
      paidAt: new Date(),
      paidTxSig: "demo-verified-tx-signature-123",
      paidByUserId: demoOwnerUserId,
      paidToTokenAccount: "demo-token-account",
    },
  });

  await prisma.paymentReconciliation.upsert({
    where: { requestId: req5Verified.id },
    create: {
      orgId,
      requestId: req5Verified.id,
      txSig: req5Verified.paidTxSig!,
      status: PaymentVerificationStatus.VERIFIED,
      detailsJson: { reasons: [], note: "In demo mode, verification results are simulated." },
    },
    update: {
      status: PaymentVerificationStatus.VERIFIED,
      detailsJson: { reasons: [], note: "In demo mode, verification results are simulated." },
    },
  });

  const req6Failed = await prisma.expenseRequest.create({
    data: {
      orgId,
      departmentId: opsDept.id,
      vendorId: activeVendor.id,
      requesterUserId: demoOwnerUserId,
      title: "Equipment purchase (FAILED demo)",
      purpose: "Monitor - demo shows failed reconciliation",
      category: "Equipment",
      amountMinor: BigInt(20_000_00),
      currency: "NPR",
      status: RequestStatus.PAID,
      requiredApprovals: 1,
      submittedAt: new Date(Date.now() - 345600000),
      decidedAt: new Date(),
      paidAt: new Date(),
      paidTxSig: "nonexistent-tx-sig-demo",
      paidByUserId: demoOwnerUserId,
      paidToTokenAccount: "demo-token-account",
    },
  });

  await prisma.paymentReconciliation.upsert({
    where: { requestId: req6Failed.id },
    create: {
      orgId,
      requestId: req6Failed.id,
      txSig: req6Failed.paidTxSig!,
      status: PaymentVerificationStatus.FAILED,
      detailsJson: {
        reasons: ["Transaction not found"],
        note: "In demo mode, this simulates a failed verification for learning.",
      },
    },
    update: {
      status: PaymentVerificationStatus.FAILED,
      detailsJson: {
        reasons: ["Transaction not found"],
        note: "In demo mode, this simulates a failed verification for learning.",
      },
    },
  });

  const req7Blocked = await prisma.expenseRequest.create({
    data: {
      orgId,
      departmentId: engDept.id,
      vendorId: activeVendor.id,
      requesterUserId: requesterId,
      title: "Team lunch (no receipt - blocked)",
      purpose: "Catering for standup",
      category: "Meals",
      amountMinor: BigInt(3_000_00),
      currency: "NPR",
      status: RequestStatus.APPROVED,
      requiredApprovals: 1,
      submittedAt: new Date(),
      decidedAt: new Date(),
    },
  });
  await prisma.approvalAction.create({
    data: { requestId: req7Blocked.id, actorUserId: approver1Id, decision: "APPROVE" },
  });

  await prisma.expenseRequest.create({
    data: {
      orgId,
      departmentId: opsDept.id,
      vendorId: draftVendor.id,
      requesterUserId: requesterId,
      title: "Draft request",
      purpose: "Work in progress",
      category: "Other",
      amountMinor: BigInt(1_000_00),
      currency: "NPR",
      status: RequestStatus.DRAFT,
      requiredApprovals: 1,
    },
  });

  await logAuditEvent({
    orgId,
    actorUserId,
    action: "DEMO_SEEDED",
    entityType: "Organization",
    entityId: orgId,
    metadata: { seedVersion: DEMO_SEED_VERSION, requestCount: 8 },
  });
}

/** Deterministic titles for 3-minute demo flow. Used by reset-deterministic and shortcut-ids. */
export const DEMO_DETERMINISTIC_TITLES = {
  DRAFT: "Office supplies",
  PENDING: "Internet bill",
  APPROVED: "Printer maintenance",
  PAID: "Stationery reimbursement",
} as const;

/** Demo tx sig for PAID request - clearly labelled, no real RPC. Shared with demo mock-pay. */
export const DEMO_PAID_TX_SIG =
  "5demo5abc1234567890abcdefghijk1234567890abcdefghijk1234567890abcdefghijk";

export interface SeedDemoDeterministicResult {
  draftId: string;
  pendingId: string;
  approvedId: string;
  paidId: string;
}

/**
 * Seed demo org with exactly 4 requests for guaranteed 3-minute demo flow.
 * Reuses base setup (depts, vendor, budget, policy) then creates the 4 requests.
 */
export async function seedDemoOrgDeterministic(input: SeedDemoInput): Promise<SeedDemoDeterministicResult> {
  const { orgId, demoOwnerUserId, actorUserId } = input;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { memberships: true },
  });
  const isDemoOrg = org?.isDemo && org.demoOwnerUserId === demoOwnerUserId;
  const isDemoOrgSlug = org?.slug === "demo-org";
  if (!org || (!isDemoOrg && !isDemoOrgSlug)) {
    throw new Error("Demo seed guard: org must be demo (owned by user) or demo-org slug");
  }

  await prisma.$transaction([
    prisma.paymentReconciliation.deleteMany({ where: { orgId } }),
    prisma.receiptFile.deleteMany({ where: { request: { orgId } } }),
    prisma.approvalAction.deleteMany({ where: { request: { orgId } } }),
    prisma.expenseRequest.deleteMany({ where: { orgId } }),
    prisma.monthlyBudget.deleteMany({ where: { orgId } }),
    prisma.department.deleteMany({ where: { orgId } }),
    prisma.vendor.deleteMany({ where: { orgId } }),
    prisma.auditEvent.deleteMany({ where: { orgId } }),
    prisma.notification.deleteMany({ where: { orgId } }),
    prisma.orgSpendPolicy.deleteMany({ where: { orgId } }),
    prisma.approvalTier.deleteMany({ where: { policy: { orgId } } }),
    prisma.approvalPolicy.deleteMany({ where: { orgId } }),
  ]);

  const requesterId = await getOrCreateDemoUser("demo-requester@demo.kharchapay.local", "demo-requester");
  const approver1Id = await getOrCreateDemoUser("demo-approver-1@demo.kharchapay.local", "demo-approver-1");

  const engDept = await prisma.department.create({
    data: { orgId, name: "Engineering" },
  });
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  await prisma.monthlyBudget.create({
    data: {
      orgId,
      departmentId: engDept.id,
      year,
      month,
      amountMinor: BigInt(150_000_00),
      currency: "NPR",
    },
  });

  const activeVendor = await prisma.vendor.create({
    data: {
      orgId,
      name: "Demo Vendor",
      status: VendorStatus.ACTIVE,
      ownerPubkey: "11111111111111111111111111111111",
    },
  });

  const approvalPolicy = await prisma.approvalPolicy.create({ data: { orgId } });
  await prisma.approvalTier.createMany({
    data: [
      { policyId: approvalPolicy.id, minAmountMinor: BigInt(0), requiredApprovals: 1 },
      { policyId: approvalPolicy.id, minAmountMinor: BigInt(50_000_00), requiredApprovals: 2 },
    ],
  });

  await prisma.orgSpendPolicy.create({
    data: {
      orgId,
      requireReceiptForPayment: false,
      receiptRequiredAboveMinor: BigInt(999_000_00),
      blockOverBudget: false,
      allowAdminOverrideOverBudget: true,
    },
  });

  const amountPaid = "700000"; // 7,000 NPR in minor (create reqPaid first to get id for memo)
  const token2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
  const treasuryAccount = "DemoTreasuryTokenAccount11111111111111111";
  const vendorAccount = "DemoVendorTokenAccount1111111111111111111";

  const reqDraft = await prisma.expenseRequest.create({
    data: {
      orgId,
      departmentId: engDept.id,
      vendorId: activeVendor.id,
      requesterUserId: requesterId,
      title: DEMO_DETERMINISTIC_TITLES.DRAFT,
      purpose: "Pens, paper, staplers",
      category: "Supplies",
      amountMinor: BigInt(5_000_00),
      currency: "NPR",
      status: RequestStatus.DRAFT,
      requiredApprovals: 1,
    },
  });

  const reqPending = await prisma.expenseRequest.create({
    data: {
      orgId,
      departmentId: engDept.id,
      vendorId: activeVendor.id,
      requesterUserId: demoOwnerUserId,
      title: DEMO_DETERMINISTIC_TITLES.PENDING,
      purpose: "Monthly ISP bill",
      category: "Infrastructure",
      amountMinor: BigInt(15_000_00),
      currency: "NPR",
      status: RequestStatus.PENDING,
      requiredApprovals: 2,
      submittedAt: new Date(),
    },
  });
  await prisma.approvalAction.create({
    data: { requestId: reqPending.id, actorUserId: approver1Id, decision: "APPROVE" },
  });

  const reqApproved = await prisma.expenseRequest.create({
    data: {
      orgId,
      departmentId: engDept.id,
      vendorId: activeVendor.id,
      requesterUserId: requesterId,
      title: DEMO_DETERMINISTIC_TITLES.APPROVED,
      purpose: "Annual maintenance contract",
      category: "Equipment",
      amountMinor: BigInt(12_000_00),
      currency: "NPR",
      status: RequestStatus.APPROVED,
      requiredApprovals: 1,
      submittedAt: new Date(Date.now() - 86400000),
      decidedAt: new Date(),
    },
  });
  await prisma.approvalAction.create({
    data: { requestId: reqApproved.id, actorUserId: approver1Id, decision: "APPROVE" },
  });

  const reqPaid = await prisma.expenseRequest.create({
    data: {
      orgId,
      departmentId: engDept.id,
      vendorId: activeVendor.id,
      requesterUserId: requesterId,
      title: DEMO_DETERMINISTIC_TITLES.PAID,
      purpose: "Reimbursement for office supplies",
      category: "Supplies",
      amountMinor: BigInt(7_000_00),
      currency: "NPR",
      status: RequestStatus.PAID,
      requiredApprovals: 1,
      submittedAt: new Date(Date.now() - 172800000),
      decidedAt: new Date(),
      paidAt: new Date(),
      paidTxSig: DEMO_PAID_TX_SIG,
      paidByUserId: demoOwnerUserId,
      paidToTokenAccount: vendorAccount,
    },
  });

  const memoVal = `KharchaPay Request ${reqPaid.id} [${org.slug}]`;
  const detailsJson = {
    reasons: [] as string[],
    observed: {
      memo: memoVal,
      amountMinor: amountPaid,
      source: treasuryAccount,
      destination: vendorAccount,
      mint: "DemoMint11111111111111111111111111111111",
      tokenProgram: token2022,
    },
    expected: {
      memo: memoVal,
      amountMinor: amountPaid,
      source: treasuryAccount,
      destination: vendorAccount,
      mint: "DemoMint11111111111111111111111111111111",
      tokenProgram: token2022,
    },
  };

  await prisma.paymentReconciliation.upsert({
    where: { requestId: reqPaid.id },
    create: {
      orgId,
      requestId: reqPaid.id,
      txSig: DEMO_PAID_TX_SIG,
      status: PaymentVerificationStatus.VERIFIED,
      detailsJson: detailsJson as object,
    },
    update: {
      status: PaymentVerificationStatus.VERIFIED,
      detailsJson: detailsJson as object,
    },
  });

  await logAuditEvent({
    orgId,
    actorUserId,
    action: "DEMO_SEEDED",
    entityType: "Organization",
    entityId: orgId,
    metadata: { deterministic: true, requestCount: 4 },
  });

  return {
    draftId: reqDraft.id,
    pendingId: reqPending.id,
    approvedId: reqApproved.id,
    paidId: reqPaid.id,
  };
}
