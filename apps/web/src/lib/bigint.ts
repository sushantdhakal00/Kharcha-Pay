/**
 * Serialize BigInt for JSON responses (JSON.stringify doesn't support BigInt).
 */
export function bigIntToString(value: bigint): string {
  return value.toString();
}

/**
 * Parse amountMinor from request (string or number) to BigInt.
 */
export function parseAmountMinor(value: unknown): bigint {
  if (typeof value === "string") return BigInt(value);
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  throw new Error("Invalid amountMinor");
}
