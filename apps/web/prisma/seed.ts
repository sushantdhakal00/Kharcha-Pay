import { PrismaClient, OrgRole, RequestStatus } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@kharchapay.local";
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const hash = await argon2.hash("demo-password-8");
    user = await prisma.user.create({
      data: { email, username: "demo", password: hash },
    });
  }

  let org = await prisma.organization.findUnique({ where: { slug: "demo-org" } });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Demo Organization",
        slug: "demo-org",
        memberships: {
          create: { userId: user.id, role: OrgRole.ADMIN },
        },
      },
    });
  }

  const deptNames = ["Engineering", "Operations", "Finance"];
  for (const name of deptNames) {
    await prisma.department.upsert({
      where: { orgId_name: { orgId: org.id, name } },
      create: { orgId: org.id, name },
      update: {},
    });
  }

  let vendor = await prisma.vendor.findUnique({ where: { orgId_name: { orgId: org.id, name: "Demo Vendor" } } });
  if (!vendor) {
    vendor = await prisma.vendor.create({ data: { orgId: org.id, name: "Demo Vendor" } });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const departments = await prisma.department.findMany({ where: { orgId: org.id } });
  for (const dept of departments) {
    await prisma.monthlyBudget.upsert({
      where: {
        departmentId_year_month: { departmentId: dept.id, year, month },
      },
      create: {
        orgId: org.id,
        departmentId: dept.id,
        year,
        month,
        amountMinor: BigInt(100_000_00), // 100,000 NPR in paisa
        currency: "NPR",
      },
      update: {},
    });
  }

  const existingDraft = await prisma.expenseRequest.findFirst({
    where: { orgId: org.id, requesterUserId: user.id, status: RequestStatus.DRAFT },
  });
  if (!existingDraft && departments[0] && vendor) {
    await prisma.expenseRequest.create({
      data: {
        orgId: org.id,
        departmentId: departments[0].id,
        vendorId: vendor.id,
        requesterUserId: user.id,
        title: "Sample expense request",
        purpose: "Demo request for testing approval flow",
        category: "Office supplies",
        amountMinor: BigInt(5000_00), // 5,000 NPR
        currency: "NPR",
        status: RequestStatus.DRAFT,
      },
    });
  }

  const existingPolicy = await prisma.approvalPolicy.findUnique({ where: { orgId: org.id } });
  if (!existingPolicy) {
    const policy = await prisma.approvalPolicy.create({ data: { orgId: org.id } });
    await prisma.approvalTier.createMany({
      data: [
        { policyId: policy.id, minAmountMinor: BigInt(0), requiredApprovals: 1 },
        { policyId: policy.id, minAmountMinor: BigInt(500000), requiredApprovals: 2 },
      ],
    });
  }

  const auditorEmail = "auditor@kharchapay.local";
  let auditorUser = await prisma.user.findUnique({ where: { email: auditorEmail } });
  if (!auditorUser) {
    const auditorHash = await argon2.hash("demo-password-8");
    auditorUser = await prisma.user.create({
      data: { email: auditorEmail, username: "auditor", password: auditorHash },
    });
  }
  const existingAuditorMembership = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: org.id, userId: auditorUser.id } },
  });
  if (!existingAuditorMembership) {
    await prisma.membership.create({
      data: { orgId: org.id, userId: auditorUser.id, role: OrgRole.AUDITOR },
    });
  }

  console.log("Seed done. Demo user:", email, "password: demo-password-8");
  console.log("Auditor user:", auditorEmail, "password: demo-password-8");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
