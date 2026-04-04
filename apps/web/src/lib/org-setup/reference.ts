const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function generateOrgSetupReference(): string {
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => BASE58[b % 58])
    .join("");
  return `ORGSETUP_${suffix}`;
}

export const LAMPORTS_PER_SOL = 1_000_000_000;
