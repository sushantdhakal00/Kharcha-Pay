# KharchaPay: Verifiable Institutional Spending on Solana

**One-line:** Approval workflows → Token-2022 payments → on-chain proof with Request-ID memo. Trust and audit without guesswork.

- **Verifiable** — Every payment links to an on-chain transaction. Proof modal + Solana Explorer give compliance-grade traceability.
- **Institutional** — RBAC, multi-approver policies, budget guardrails, receipt requirements, audit log.
- **Solana-native** — Token-2022 Required Memo on Transfer ties each transfer to the approved request; low fees, fast finality.

---

## Concept

Institutions need **trust + audit + verification** for spending. KharchaPay runs approval workflows (draft → submit → approve → pay), then executes Token-2022 transfers with a **required memo** that embeds the Request-ID. Third parties (auditors, regulators) can verify any payment by checking the tx on Solana and matching the memo—no backend trust needed.

---

## How it works

1. **Create** — Staff create expense requests (department, vendor, amount, purpose).
2. **Approve** — Configurable tiers (e.g. >50k requires 2 approvals); requester cannot approve own.
3. **Pay** — ADMIN triggers a Token-2022 transfer; memo format: `KharchaPay Request <requestId>`.
4. **Reconcile** — Server verifies tx on-chain (memo, amount, source, destination, mint).
5. **Proof** — Proof modal shows checklist; Explorer link shows the memo in the tx.

---

## 3-minute demo script

| Time | Step | Exact action |
|------|------|--------------|
| 0:00 | Problem | *"Institutions need verifiable spend. Spreadsheets and opaque wires don’t cut it."* |
| 0:20 | Create & submit | Dashboard → **Guided Demo Flow** → 1) Submit Draft → open draft → **Submit (Demo)** |
| 1:00 | Approve | Auto-redirects to PENDING → **Approve (Demo)** |
| 1:30 | Pay | Auto-redirects to APPROVED → **Pay (Demo)** |
| 2:00 | Explorer | Auto-redirects to PAID with proof modal; click **View on Explorer**, show memo in tx instructions |
| 2:30 | Proof modal | Walk through checklist: memo, Token-2022, source, destination, amount |
| 2:50 | Closing | *"Every payment is independently verifiable. No backend needed for audit."* |

---

## Run locally

```bash
npm install
npm run db:generate
npm run db:migrate:deploy
# Set .env: DATABASE_URL, JWT_SECRET (min 32 chars)
npm run dev
```

App: [http://localhost:3000](http://localhost:3000). Register → Create org → Add department + budget + vendor → Create request.

**Env (create `apps/web/.env`):**

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Min 32 chars, for signing JWTs |
| `SOLANA_RPC_URL` | For pay/verify | e.g. `https://api.devnet.solana.com` |
| `TREASURY_KEYPAIR_JSON` | For pay | 64-byte array as JSON `[1,2,...,64]` |
| `SOLANA_CLUSTER` | For pay | `devnet` or `mainnet-beta` |
| `NEXT_PUBLIC_INTERNAL_MODE` | Demo UI | `1` to show Guided Demo Flow |

**Build:** `npm run typecheck` and `npm run build` (from repo root).

---

## Demo mode (deterministic reset)

For a reliable 3-minute demo:

1. **Start demo** — Register, then **Try Demo** or `/app/demo` → creates per-user demo org.
2. **Reset** — Admin Dashboard → **Demo Shortcuts** → **Reset demo** (calls `POST /api/demo/reset-deterministic`).
3. **Guided flow** — Dashboard shows **Guided Demo Flow** (1) Submit Draft → 2) Approve Pending → 3) Pay Approved → 4) View Proof).
4. **Next action** — On each request page, a **Next demo action** button appears; after Submit/Approve/Pay, the app auto-redirects to the next step.
5. **Proof** — Paid request opens with `?proof=1`; Proof modal auto-opens.

**Internal mode:** Set `NEXT_PUBLIC_INTERNAL_MODE=1` to show Guided Demo Flow and Next demo action buttons (demo org or `orgSlug === "demo-org"`).

---

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Project structure, tech stack, API, DB models, Solana flow |
| [docs/DATA-MODELS.md](docs/DATA-MODELS.md) | Prisma models quick reference |
| [docs/ops/env.md](docs/ops/env.md) | Environment variables |
| [docs/ops/migrations.md](docs/ops/migrations.md) | DB migrations |
| [docs/release-notes.md](docs/release-notes.md) | Shipped modules, limitations |

---

## Tech highlights

- Next.js 14 (App Router), Prisma, Tailwind
- Token-2022 + MemoTransfer (required memo); reconciliation against on-chain tx
- CSRF, step-up re-auth for pay; RBAC (ADMIN, APPROVER, STAFF, AUDITOR)
- Audit log, CSV exports; optional: QuickBooks, Circle, etc. (available later)

---

## Future work

- **Transparency mode** — Optional public proof URLs for stakeholders
- **ZK civic eligibility** — Privacy-preserving compliance proofs
- **Integrations** — Accounting sync, bank rails, more chains

---

## Submission checklist

- [ ] **GitHub repo** — Public link
- [ ] **Live link** — (if deployed)
- [ ] **Demo video** — Link placeholder: _[Demo video URL]_
- [ ] **Build-in-public** — Link placeholder: _[Build log / Twitter / etc.]_

---

## How to record the demo

- **Screen** — 1920×1080 or similar; hide unnecessary toolbars
- **No errors** — Reset demo first; ensure vendor wallet = treasury (self-pay) if using devnet
- **Show Explorer** — Click **View on Explorer** on paid request; zoom into memo instruction
- **Show Proof modal** — Paid request with `?proof=1`; walk through checklist
- **Guided flow** — Use Guided Demo Flow banner or Next demo action buttons; let auto-redirect carry you through

---

## License

MIT. See [LICENSE](LICENSE) if present.
