import Link from "next/link";

export default function DocsPage() {
  const links = [
    { href: "/whitepaper", label: "Whitepaper", desc: "Product overview, Finance Autopilot loop, roles, verification model" },
    { href: "/app/setup", label: "Getting Started", desc: "Create org, add departments, set budgets, add members" },
    { href: "/whitepaper#roles", label: "Roles & Permissions", desc: "ADMIN, APPROVER, REQUESTER, AUDITOR and separation of duties" },
    { href: "/whitepaper#verifiable", label: "Payment Verification", desc: "paidTxSig, memo format, VERIFIED / WARNING / FAILED" },
    { href: "/whitepaper#security", label: "Receipts & Compliance", desc: "Receipt requirements, access control, audit trail" },
  ];

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-900">Docs</h1>
      <p className="mt-1 text-slate-600">
        Documentation and reference for KharchaPay.
      </p>
      <ul className="mt-6 space-y-4">
        {links.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900">{item.label}</span>
              <p className="mt-1 text-sm text-slate-600">{item.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-slate-500">
        Most topics are covered in the{" "}
        <Link href="/whitepaper" className="text-slate-900 underline hover:no-underline">
          public whitepaper
        </Link>
        .
      </p>
    </div>
  );
}
