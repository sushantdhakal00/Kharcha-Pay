export function formatAmount(minor: string | number, currency = "USD"): string {
  const n = typeof minor === "string" ? parseInt(minor, 10) : minor;
  if (isNaN(n)) return "0";
  const major = n / 100;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(major);
}
