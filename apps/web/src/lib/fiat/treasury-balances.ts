import {
  TreasuryLedgerAccount,
  LedgerDirection,
} from "@prisma/client";

const { DEBIT, CREDIT } = LedgerDirection;

export interface LedgerEntryLike {
  account: TreasuryLedgerAccount | string;
  direction: LedgerDirection | string;
  amountMinor: bigint | number;
  currency: string;
  createdAt: Date;
}

export type AccountBalances = Record<string, Record<string, bigint>>;

export interface OrgBalanceSnapshot {
  totalByCurrency: Record<string, bigint>;
  byAccount: AccountBalances;
}

export function applyLedgerEntry(
  state: AccountBalances,
  entry: LedgerEntryLike
): AccountBalances {
  const acct = String(entry.account);
  const cur = entry.currency.toUpperCase();
  const amt = BigInt(entry.amountMinor);

  if (!state[acct]) {
    state[acct] = {};
  }
  if (!state[acct][cur]) {
    state[acct][cur] = BigInt(0);
  }

  if (entry.direction === DEBIT || entry.direction === "DEBIT") {
    state[acct][cur] += amt;
  } else {
    state[acct][cur] -= amt;
  }

  return state;
}

export function computeAccountBalances(
  entries: LedgerEntryLike[]
): AccountBalances {
  const state: AccountBalances = {};
  for (const entry of entries) {
    applyLedgerEntry(state, entry);
  }
  return state;
}

export function computeOrgBalances(
  entries: LedgerEntryLike[]
): OrgBalanceSnapshot {
  const byAccount = computeAccountBalances(entries);

  const totalByCurrency: Record<string, bigint> = {};
  for (const acct of Object.values(byAccount)) {
    for (const [cur, bal] of Object.entries(acct)) {
      if (!totalByCurrency[cur]) {
        totalByCurrency[cur] = BigInt(0);
      }
      totalByCurrency[cur] += bal;
    }
  }

  return { totalByCurrency, byAccount };
}

export function computeBalanceAsOf(
  entries: LedgerEntryLike[],
  asOf: Date
): OrgBalanceSnapshot {
  const filtered = entries.filter((e) => e.createdAt <= asOf);
  return computeOrgBalances(filtered);
}

export function getAccountBalance(
  balances: AccountBalances,
  account: TreasuryLedgerAccount | string,
  currency: string = "USD"
): bigint {
  return balances[String(account)]?.[currency.toUpperCase()] ?? BigInt(0);
}

export const ALL_ACCOUNTS: TreasuryLedgerAccount[] = [
  TreasuryLedgerAccount.TREASURY_WALLET,
  TreasuryLedgerAccount.PROVIDER_WALLET,
  TreasuryLedgerAccount.VENDOR_PAYABLE,
  TreasuryLedgerAccount.CLEARING,
  TreasuryLedgerAccount.FEES_EXPENSE,
  TreasuryLedgerAccount.SUSPENSE,
];

export function flattenBalances(
  byAccount: AccountBalances
): Array<{ account: string; currency: string; balanceMinor: bigint }> {
  const result: Array<{ account: string; currency: string; balanceMinor: bigint }> = [];
  for (const [account, currencies] of Object.entries(byAccount)) {
    for (const [currency, balanceMinor] of Object.entries(currencies)) {
      result.push({ account, currency, balanceMinor });
    }
  }
  return result;
}
