# KharchaPay — Architecture & Project Reference

**One-line:** Verifiable institutional spending on Solana — approval workflows → Token-2022 payments → on-chain proof with Request-ID memo.

---

## 1. Project Structure

### Monorepo Layout

```
kharcha pay/
├── apps/
│   ├── web/           # Next.js 14 (App Router), Prisma, Tailwind — main app
│   └── api/           # Standalone Express API (optional)
├── packages/
│   └── shared/        # @kharchapay/shared — Zod schemas, types, validation
├── scripts/           # Env check, smoke tests, ship gates
├── docs/              # Ops docs, env, migrations, runbook
├── package.json       # Workspace root; engines: Node >= 18
└── docker-compose.yml
```

### Root Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Starts Next.js dev server (free-port + apps/web) |
| `npm run build` | Build apps/web |
| `npm run start` | Start production server |
| `npm run db:generate` | Prisma generate |
| `npm run db:migrate:deploy` | Run migrations |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run ship-gate` | typecheck + lint + test + build |
| `npm run release-gate` | ship-gate + smoke-prod |

---

## 2. Tech Stack

### Core

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14 (App Router) | SSR, API routes, pages |
| Prisma | 5.x | ORM, PostgreSQL |
| Tailwind CSS | 3.x | Styling |
| React | 18 | UI |
| TypeScript | 5.x | Type safety |
| Zod | 3.x | Schema validation |

### Solana / Token-2022

| Package | Purpose |
|---------|---------|
| @solana/web3.js | Connection, transactions |
| @solana/spl-token | Token accounts, transfers |
| @solana/spl-memo | Memo instruction (required memo) |
| Token-2022 Program ID | `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` |

### Other

| Package | Purpose |
|---------|---------|
| argon2 | Password hashing |
| jose | JWT / session |
| ioredis | Redis (SSE, chat pub/sub) |
| recharts | Charts |

---

## 3. Web App Structure

### App Router (`apps/web/src/app/`)

**Auth & Public**

- `/` — Landing
- `/login`, `/register`, `/forgot-password`, `/reset-password`
- `/pricing`, `/whitepaper`
- `/onboarding/create-org`, `/onboarding/pay`, `/onboarding/terms`

**Main App (`/app`)**

| Route | Purpose |
|-------|---------|
| `/app` | App home |
| `/app/dashboard` | Role-based dashboards (admin, approver, staff, auditor) |
| `/app/requests` | Expense requests list |
| `/app/requests/new` | New request |
| `/app/requests/[id]` | Request detail (approve, pay, proof) |
| `/app/requests/[id]/edit` | Edit draft |
| `/app/approvals` | Pending approvals |
| `/app/payments` | Payments list |
| `/app/vendors` | Vendors |
| `/app/vendors/[id]` | Vendor detail |
| `/app/invoices` | Invoices (P2P) |
| `/app/pos` | Purchase orders |
| `/app/receipts` | Receipts |
| `/app/reports` | Reports, exports |
| `/app/audit` | Audit log |
| `/app/compliance` | Compliance |
| `/app/chat` | Team chat |
| `/app/demo` | Demo mode |
| `/app/setup` | Org setup |
| `/app/solana/confidential-demo` | Token-2022 confidential demo |

**Settings (`/app/settings`)**

- Vendors, Departments, Budgets
- Integrations, QuickBooks, Spend Policy
- Audit Retention, GL Codes, Matching
- Members, System, Ops

**Internal**

- `/app/docs` — Internal docs
- `/app/debug`, `/app/security-check`

---

## 4. API Structure

### Auth & Health

- `POST /api/auth/login`
- `GET /api/csrf`
- `GET /api/health`, `/api/health/db`, `/api/health/redis`, `/api/health/treasury`

### Org-Scoped (`/api/orgs/[orgId]/`)

**Requests**

- `GET/POST /api/orgs/[orgId]/requests`
- `GET /api/orgs/[orgId]/requests/[requestId]`
- `POST /api/orgs/[orgId]/requests/[requestId]/decide`
- `POST /api/orgs/[orgId]/requests/[requestId]/pay`
- `POST /api/orgs/[orgId]/requests/[requestId]/submit`
- `POST /api/orgs/[orgId]/requests/[requestId]/receipt`

**Departments & Budgets**

- `GET/POST /api/orgs/[orgId]/departments`
- `/api/orgs/[orgId]/departments/[id]/budget-remaining`

**Vendors**

- CRUD: `/api/orgs/[orgId]/vendors`, `/api/orgs/[orgId]/vendors/[id]`
- Payout profile, onboarding

**Chain (Solana)**

- `GET /api/orgs/[orgId]/chain/status`
- `POST /api/orgs/[orgId]/chain/init-mint`, `apply-pending`, `deposit`, `ct-transfer`

**Payments & Reconciliation**

- `GET /api/orgs/[orgId]/payments`
- `POST /api/orgs/[orgId]/reconcile/request`

**Procure-to-Pay**

- Invoices: CRUD, submit, reject, coding, bulk-assign
- POs: CRUD, issue
- Matching

**Treasury**

- Balances, ledger, policy, wallets, mints, spend-policy, reconciliation

**Accounting (QBO)**

- Sync, mappings, callback, remote-changes, disconnect, logs, jobs

**Chat**

- Channels, messages, pinned, search, unread, permissions

**Exports**

- Requests, payments, audit, budget-vs-actual

### Demo

- `POST /api/demo/reset-deterministic`
- `GET /api/demo/readiness`, `/api/demo/shortcut-ids`

### Webhooks

- `/api/webhooks/circle`, `/api/webhooks/quickbooks`

---

## 5. Database (Prisma)

**Provider:** PostgreSQL

### Core Models

| Model | Purpose |
|-------|---------|
| `User` | Auth, memberships |
| `Organization` | Tenant (slug, currency, demo, status) |
| `Membership` | User–org with role (ADMIN, APPROVER, STAFF, AUDITOR) |
| `Department` | Departments per org |
| `MonthlyBudget` | Budget per department per month |
| `Vendor` | Vendors, wallet, status, risk |
| `ExpenseRequest` | Expense lifecycle (DRAFT → PENDING → APPROVED/REJECTED → PAID) |
| `ApprovalPolicy`, `ApprovalTier`, `ApprovalAction` | Multi-tier approvals |
| `ReceiptFile` | Receipt attachments |
| `PaymentReconciliation` | On-chain verification status |
| `AuditEvent` | Audit trail |

### Solana / Chain

| Model | Purpose |
|-------|---------|
| `OrgChainConfig` | token2022Mint, tokenProgramId, treasury, token accounts, cluster |
| `OrgTreasuryWallet` | Encrypted keypair, cluster |
| `OrgSetupPaymentIntent`, `OrgSetupPaymentTx` | Org setup SOL payments |

### Procure-to-Pay

| Model | Purpose |
|-------|---------|
| `PurchaseOrder`, `PurchaseOrderLineItem` | POs |
| `GoodsReceipt`, `GoodsReceiptLineItem` | Receipts |
| `Invoice`, `InvoiceLineItem`, `InvoiceAttachment` | Invoices |
| `MatchResult`, `OrgMatchTolerance`, `OrgGLCode` | Matching |
| `Payment` | Invoice payments |

### Vendor

| Model | Purpose |
|-------|---------|
| `VendorContact`, `VendorDocument`, `VendorPaymentMethod` | Vendor details |
| `VendorBankChangeRequest`, `VendorOnboardingCase` | Onboarding |
| `OrgVendorPolicy` | Org vendor policy |

### Treasury / Fiat

| Model | Purpose |
|-------|---------|
| `TreasuryDepositIntent` | Fiat deposit intents |
| `TreasuryPayoutIntent`, `TreasuryPayoutApproval` | Payouts |
| `TreasuryLedgerEntry`, `TreasuryEvent` | Ledger |
| `TreasuryWallet`, `TreasuryMintRegistry` | Wallets, mints |
| `TreasurySpendPolicy`, `TreasurySafetyControls` | Policy, controls |
| `VendorFiatPayoutProfile` | Fiat payout profile |

### Accounting (QBO)

| Model | Purpose |
|-------|---------|
| `AccountingConnection`, `AccountingMapping` | Connection, mappings |
| `AccountingSyncJob`, `AccountingSyncCursor`, `AccountingSyncLog` | Sync |
| `QuickBooksWebhookEvent`, `AccountingRemoteChange` | Webhooks |
| `OrgExternalVendor`, `OrgExternalBill`, `OrgExternalBillPayment` | External entities |

### Chat

| Model | Purpose |
|-------|---------|
| `ChatChannel`, `ChatChannelPermission` | Channels |
| `ChatMessage`, `ChatMessageAttachment`, `ChatMessageReaction` | Messages |
| `ChatPinnedMessage`, `ChatChannelReadState` | State |

### Ops

| Model | Purpose |
|-------|---------|
| `OutboxEvent` | Outbox pattern |
| `WebhookEndpoint`, `WebhookDeliveryAttempt` | Webhooks |
| `Notification` | In-app notifications |
| `CronRun` | Cron execution tracking |

---

## 6. Expense Request Lifecycle

```
DRAFT → PENDING → APPROVED / REJECTED
                        ↓
                    (if APPROVED)
                        ↓
                      PAID
```

1. **DRAFT** — Staff create/edit; attach receipts.
2. **Submit** — Moves to PENDING; requires receipts per spend policy.
3. **PENDING** — Approvers decide; requester excluded; multi-tier by amount.
4. **APPROVED** — ADMIN can pay; budget/vendor checks.
5. **Pay** — Token-2022 transfer with memo; `paidTxSig` stored.
6. **PAID** — Reconciliation verifies on-chain; Proof modal shows checklist + Explorer link.

### Key Fields on ExpenseRequest

- `amountMinor`, `currency`, `departmentId`, `vendorId`, `title`, `purpose`, `category`
- `paidTxSig` — On-chain transaction signature
- `paidAt`, `paidToTokenAccount`
- `verificationStatus` (via PaymentReconciliation): VERIFIED, WARNING, FAILED, PENDING

---

## 7. Solana / Token-2022

### Memo Format

```
KharchaPay Request <requestId> [orgSlug]
```

### Payment Flow

1. Build memo instruction via `spl-memo`
2. Build Token-2022 transfer (treasury → vendor ATA)
3. Transaction: memo + transfer
4. Store signature in `paidTxSig`

### Reconciliation (`lib/solana/verify-payment.ts`)

- Fetches tx from RPC
- Verifies: memo, amount, source, destination, mint, token program
- Updates `PaymentReconciliation` with status and reasons

### Explorer URL

```ts
getExplorerTxUrl(signature, cluster)
// → https://explorer.solana.com/tx/{sig}?cluster=devnet|mainnet-beta
```

### Paid Request UI (Proof)

- **paidTxSig** — Displayed (truncated) with label
- **Explorer URL** — Button + inline link with cluster (devnet/mainnet)
- **Token-2022 Program ID** — From org chain config
- **Mint address** — From org chain config
- **Proof modal** — Checklist: memo, Token-2022, mint, source, destination, amount

---

## 8. Lib Modules (`apps/web/src/lib/`)

| Category | Modules |
|----------|---------|
| Auth | `auth.ts`, `get-current-user.ts`, `require-user.ts`, `require-org-role.ts`, `require-recent-auth.ts` |
| DB | `db.ts` |
| Env | `env.ts` (Zod fail-fast) |
| RBAC | `rbac.ts` |
| Solana | `solana/connection.ts`, `solana/payments.ts`, `solana/verify-payment.ts`, `solana/explorer-url.ts` |
| Reconciliation | `reconcile.ts` |
| Approval | `approval-policy.ts` |
| Fiat / Treasury | `fiat/fiat-service.ts`, `fiat/onchain-adapter.ts`, `fiat/treasury-*`, `fiat/wallets/*` |
| Accounting | `accounting/sync-worker.ts`, `qbo/*`, `accounting/export-bills.ts` |
| Chat | `chat-auth.ts`, `chat-permissions.ts`, `chat-pubsub.ts`, `chat-event-bus.ts` |
| Ops | `audit.ts`, `outbox.ts`, `webhook-deliver.ts`, `receipt-storage.ts`, `encryption.ts` |
| Demo | `demo-seed.ts` |

---

## 9. Environment

### Required (Production)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL URL |
| `JWT_SECRET` | Min 32 chars |
| `ENCRYPTION_KEY` | 64-char hex (AES-256-GCM) |
| `CRON_SECRET` | Cron endpoint auth |
| `NEXT_PUBLIC_APP_URL` | Base URL |

### Solana (Optional)

| Variable | Description |
|----------|-------------|
| `SOLANA_RPC_URL` | Devnet RPC |
| `SOLANA_RPC_URL_MAINNET` | Mainnet RPC |
| `TREASURY_KEYPAIR_JSON` | 64-byte JSON array |
| `SOLANA_CLUSTER` | `devnet` or `mainnet-beta` |

### Other

| Variable | Purpose |
|----------|---------|
| `REDIS_URL` | Multi-instance (SSE, chat) |
| `QUICKBOOKS_*` | QuickBooks integration |
| `CIRCLE_*` | Circle fiat |
| `DEMO_MODE`, `NEXT_PUBLIC_INTERNAL_MODE` | Demo UI |
| `ORG_CREATE_FEE_SOL`, `ORG_CREATE_TREASURY_PUBKEY` | Org setup |

See [docs/ops/env.md](ops/env.md) for full reference.

---

## 10. Security

- **RBAC** — Org-scoped; cross-org blocked
- **CSRF** — CSRF tokens on state-changing requests
- **Step-up re-auth** — Required for pay (recent auth)
- **Cookies** — HttpOnly, Secure, SameSite
- **Encryption** — `ENCRYPTION_KEY` for tokens at rest
- **Webhooks** — SSRF guards (HTTPS, no localhost/private IP)

---

## 11. Related Docs

- [README.md](../README.md) — Quick start, demo script
- [docs/ops/env.md](ops/env.md) — Environment reference
- [docs/ops/migrations.md](ops/migrations.md) — DB migrations
- [docs/ops/production-readiness-checklist.md](ops/production-readiness-checklist.md) — Deploy checklist
- [docs/ops/runbook.md](ops/runbook.md) — Operations
- [docs/release-notes.md](release-notes.md) — Shipped modules, limitations

---

*Last updated from codebase exploration.*
