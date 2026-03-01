import Link from "next/link";

export default function WhitepaperPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" className="font-semibold text-slate-900">
            KharchaPay
          </Link>
          <div className="flex gap-4">
            <Link
              href="/whitepaper"
              className="text-sm font-medium text-slate-700"
            >
              Whitepaper
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Try Demo
            </Link>
          </div>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          KharchaPay Whitepaper
        </h1>
        <p className="mt-2 text-slate-600">
          Finance Autopilot for Organizations — Budgets, Approvals, Payments, and Verifiable On-Chain Proof
        </p>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-slate-900">
            1. What KharchaPay Is
          </h2>
          <p className="mt-3 text-slate-700 leading-relaxed">
            KharchaPay is an expense and payment management system for organizations. It connects budgets, approval workflows, and on-chain payments with a canonical memo format so every payout can be verified against the blockchain. Finance teams use it to enforce policies, control spending, and maintain a complete audit trail from request to payment to reconciliation.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900">
            2. The Finance Autopilot Loop
          </h2>
          <p className="mt-3 text-slate-700 leading-relaxed">
            The core flow is a closed loop:
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-6 text-slate-700">
            <li>
              <strong>Budget</strong> — Monthly budgets per department; requests are checked against remaining budget before approval and payment.
            </li>
            <li>
              <strong>Request</strong> — Staff create expense requests (title, purpose, category, amount, department, vendor).
            </li>
            <li>
              <strong>Approval policy</strong> — Tiered approval (e.g., 1 approver up to a threshold, 2 above). Approvers see pending requests and approve or reject.
            </li>
            <li>
              <strong>Pay</strong> — Admins execute payment only for approved requests that meet policy (receipt, budget, vendor status). Payment is a Token-2022 transfer with a required memo.
            </li>
            <li>
              <strong>Tx + Memo</strong> — Each payment includes an on-chain memo tying the transaction to the request and org. The transaction signature is stored as <code className="rounded bg-slate-200 px-1">paidTxSig</code>.
            </li>
            <li>
              <strong>Reconciliation</strong> — Reconciliation runs against the chain to verify memo, amount, source, and destination. Results are stored with status VERIFIED, WARNING, or FAILED.
            </li>
            <li>
              <strong>Audit & exports</strong> — All key actions are audited. CSV exports include payments, requests, and budget vs actual, with verification status.
            </li>
          </ol>
        </section>

        <section id="roles" className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900">
            3. Roles & Permissions
          </h2>
          <p className="mt-3 text-slate-700 leading-relaxed">
            Separation of duties is enforced via four roles:
          </p>
          <table className="mt-4 w-full border-collapse border border-slate-300 text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 text-left">Role</th>
                <th className="border border-slate-300 px-3 py-2 text-left">Capabilities</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-3 py-2 font-medium">ADMIN</td>
                <td className="border border-slate-300 px-3 py-2">Full access: create/update org settings, departments, budgets, vendors; manage members; configure approval and spend policy; execute payments; run reconciliation; chain operations.</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 font-medium">APPROVER</td>
                <td className="border border-slate-300 px-3 py-2">Approve or reject requests; cannot execute payments or change org configuration.</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 font-medium">REQUESTER (STAFF)</td>
                <td className="border border-slate-300 px-3 py-2">Create and manage own expense requests; submit for approval; upload receipts. Cannot approve or pay.</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-3 py-2 font-medium">AUDITOR</td>
                <td className="border border-slate-300 px-3 py-2">Read-only: view requests, payments, audit log, reports, exports. No write access to any entity.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900">
            4. Policy Enforcement
          </h2>
          <p className="mt-3 text-slate-700 leading-relaxed">
            Spend policy configures:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-slate-700">
            <li><strong>Receipt required</strong> — Payment blocked if no receipt is attached and amount exceeds the threshold.</li>
            <li><strong>Over-budget blocking</strong> — Payment blocked when it would exceed remaining department budget unless admin override is allowed and a sufficient override note is provided.</li>
            <li><strong>Reauth before sensitive actions</strong> — Payment, reconciliation, spend policy, approval policy, and vendor updates require recent re-authentication (within a time window).</li>
          </ul>
        </section>

        <section id="verifiable" className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900">
            5. Verifiable Payments Model
          </h2>
          <h3 className="mt-4 font-medium text-slate-800">paidTxSig on Request</h3>
          <p className="mt-2 text-slate-700 leading-relaxed">
            When a request is paid, the on-chain transaction signature is stored on the request as <code className="rounded bg-slate-200 px-1">paidTxSig</code>. This allows anyone with RPC access to verify the payment.
          </p>

          <h3 className="mt-4 font-medium text-slate-800">Canonical Memo Format</h3>
          <p className="mt-2 text-slate-700 leading-relaxed">
            The memo is a space-separated string: <code className="rounded bg-slate-200 px-1">KharchaPay Request</code> followed by the request ID and optionally the org slug. Example: <code className="rounded bg-slate-200 px-1">KharchaPay Request clx123abc acme-corp</code>. The memo appears in the same transaction as the Token-2022 transfer and is required for verification.
          </p>

          <h3 className="mt-4 font-medium text-slate-800">Verification Statuses</h3>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-slate-700">
            <li><strong>VERIFIED</strong> — Memo, amount, source, destination, and mint match expectations. The payment is confirmed on-chain.</li>
            <li><strong>WARNING</strong> — Verification found a non-critical mismatch; used for edge cases.</li>
            <li><strong>FAILED</strong> — Transaction not found, memo mismatch, amount mismatch, wrong source/destination/mint, or RPC error. Details are stored in the reconciliation record.</li>
            <li><strong>PENDING</strong> — Not yet checked by reconciliation.</li>
          </ul>
        </section>

        <section id="security" className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900">
            6. Security & Data Handling
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-slate-700">
            <li><strong>CSRF + Reauth</strong> — State-changing requests require a CSRF token; sensitive actions require step-up re-authentication within a defined window.</li>
            <li><strong>Receipt storage</strong> — Receipts are stored in a controlled directory. Access is restricted to org members with read access (including auditors). Downloads use no-store caching.</li>
            <li><strong>Audit events</strong> — Key actions (create, submit, approve, reject, pay, reconcile) are logged immutably. Secrets are stripped from audit payloads.</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900">
            7. Threat Model & Limitations
          </h2>
          <h3 className="mt-4 font-medium text-slate-800">What KharchaPay Helps Prevent</h3>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-slate-700">
            <li>Unauthorized payments (role-based access; reauth for pay)</li>
            <li>Over-budget spending without explicit override</li>
            <li>Payment without required receipts (when policy is enabled)</li>
            <li>Fabrication of payment records (on-chain verification)</li>
          </ul>

          <h3 className="mt-4 font-medium text-slate-800">What It Cannot Prevent</h3>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-slate-700">
            <li>RPC downtime or rate limits — reconciliation may fail or be delayed</li>
            <li>Misconfigured treasury or vendor wallet — payments can fail or go to the wrong address</li>
            <li>Compromised admin credentials — an admin can pay approved requests</li>
          </ul>

          <h3 className="mt-4 font-medium text-slate-800">Confidential Transfer</h3>
          <p className="mt-2 text-slate-700 leading-relaxed">
            The product supports confidential transfer flows for demonstration purposes where configured. Standard transfers use Token-2022 with required memo. The current implementation does not enforce confidentiality guarantees beyond what the underlying chain supports.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900">
            8. Ops & Reliability
          </h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-slate-700">
            <li><strong>Reconciliation</strong> — Rerunnable and idempotent. Each run verifies paid requests and upserts reconciliation records. Rate limiting is applied to avoid RPC overload.</li>
            <li><strong>Audit events</strong> — Append-only; no update or delete. Retention can be configured per org.</li>
            <li><strong>Exports</strong> — CSV exports for requests, payments, audit, and budget-vs-actual. Exports include verification status where applicable.</li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900">
            FAQ
          </h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="font-medium text-slate-800">Is KharchaPay open source?</dt>
              <dd className="mt-1 text-slate-600">KharchaPay is an expense and payment management product. See your deployment for licensing.</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-800">Which blockchain does it use?</dt>
              <dd className="mt-1 text-slate-600">KharchaPay integrates with Solana using Token-2022 and required memo for verifiable on-chain payments.</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-800">Can I try it without real data?</dt>
              <dd className="mt-1 text-slate-600">Yes. A per-user Demo Workspace is available. Sign up, then start the demo to get a sandbox org with sample data. Demo data is isolated and never affects real organizations.</dd>
            </div>
          </dl>
        </section>

        <div className="mt-12 flex flex-wrap gap-4 border-t border-slate-200 pt-8">
          <Link
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to Home
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Try Demo
          </Link>
        </div>
      </article>
    </main>
  );
}
