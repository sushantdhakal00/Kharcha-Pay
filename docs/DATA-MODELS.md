# KharchaPay — Data Models Reference

Quick reference for Prisma models. Full schema: `apps/web/prisma/schema.prisma`.

---

## Core Entities

### User
- `id`, `email`, `username`, `displayName`, `imageUrl`, `password`, `jwtVersion`
- Relations: `memberships`, `expenseRequests`, `approvalActions`, `notifications`

### Organization
- `id`, `name`, `slug`, `currency`, `isDemo`, `status` (PENDING_PAYMENT | PENDING_TERMS | ACTIVE)
- Relations: `memberships`, `departments`, `vendors`, `requests`, `chainConfig`, `approvalPolicy`, `spendPolicy`, etc.

### Membership
- `orgId`, `userId`, `role` (ADMIN | APPROVER | STAFF | AUDITOR)
- Unique: `[orgId, userId]`

### Department
- `id`, `orgId`, `name`
- Unique: `[orgId, name]`
- Relations: `budgets`, `requests`

### MonthlyBudget
- `orgId`, `departmentId`, `year`, `month` (1–12), `amountMinor`, `currency`
- Unique: `[departmentId, year, month]`

### Vendor
- `id`, `orgId`, `name`, `displayName`, `legalName`, `status` (DRAFT | ACTIVE | ARCHIVED | ONBOARDING | BLOCKED | INACTIVE)
- Solana: `ownerPubkey`, `tokenAccount`
- Relations: `contacts`, `documents`, `paymentMethods`, `requests`

---

## Expense Request Flow

### ExpenseRequest
- `id`, `orgId`, `departmentId`, `vendorId`, `requesterUserId`
- `title`, `purpose`, `category`, `amountMinor`, `currency`
- `status`: DRAFT | PENDING | APPROVED | REJECTED | PAID
- `requiredApprovals`, `submittedAt`, `decidedAt`, `paidAt`
- **On-chain proof:** `paidTxSig`, `paidByUserId`, `paidToTokenAccount`
- Relations: `approvalActions`, `receiptFiles`, `paymentReconciliation`

### ApprovalPolicy
- `orgId` (1:1 with org)
- `tiers`: ApprovalTier[]

### ApprovalTier
- `policyId`, `minAmountMinor`, `requiredApprovals`

### ApprovalAction
- `requestId`, `actorUserId`, `decision` (APPROVE | REJECT), `note`
- Unique: `[requestId, actorUserId]`

### ReceiptFile
- `requestId`, `fileName`, `mimeType`, `sizeBytes`, `storageKey`, `storageProvider`

### PaymentReconciliation
- `requestId`, `status` (VERIFIED | WARNING | FAILED | PENDING)
- `checkedAt`, `detailsJson` (reasons, observed, expected)

---

## Solana / Chain

### OrgChainConfig
- `orgId`, `cluster` (devnet | mainnet-beta)
- `token2022Mint`, `tokenProgramId` (default: Token-2022)
- `treasuryOwnerPubkey`, `treasuryTokenAccount`
- `vendorOwnerPubkey`, `vendorTokenAccount`
- Last tx fields: `lastInitMintTx`, `lastDepositTx`, etc.

### OrgTreasuryWallet
- `orgId`, `chain` (SOLANA), `cluster`
- `treasuryPubkey`, `treasuryKeypairEncrypted`, `keyVersion`

---

## Procure-to-Pay

- **PurchaseOrder** — `status`, line items
- **GoodsReceipt** — Links to PO
- **Invoice** — Status, line items, attachments
- **MatchResult** — PO ↔ Receipt ↔ Invoice matching
- **Payment** — Invoice payments

---

## Treasury / Fiat

- **TreasuryDepositIntent** — Fiat deposit flow
- **TreasuryPayoutIntent**, **TreasuryPayoutApproval**
- **TreasuryLedgerEntry**, **TreasuryEvent**
- **TreasuryWallet**, **TreasuryMintRegistry**
- **TreasurySpendPolicy**, **TreasurySafetyControls**

---

## Accounting (QuickBooks)

- **AccountingConnection** — OAuth connection
- **AccountingMapping** — Entity mappings
- **AccountingSyncJob**, **AccountingSyncCursor**, **AccountingSyncLog**
- **OrgExternalVendor**, **OrgExternalBill**, **OrgExternalBillPayment**

---

## Chat

- **ChatChannel**, **ChatChannelPermission**
- **ChatMessage**, **ChatMessageAttachment**, **ChatMessageReaction**
- **ChatPinnedMessage**, **ChatChannelReadState**
