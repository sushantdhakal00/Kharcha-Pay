/**
 * Import reference data from QBO: Accounts, Vendors, Classes.
 * Day 28: fetch company info (home currency, multi-currency) and store on connection.
 */
import { prisma } from "../db";
import { qboQuery } from "../qbo/client";
import { getValidQboAccessToken } from "../qbo/get-valid-token";
import { fetchQboCompanyInfo } from "./qbo-company-info";

export interface SyncReferenceResult {
  accountsImported: number;
  vendorsImported: number;
  classesImported: number;
}

export async function syncReferenceData(
  orgId: string,
  jobId: string,
  log: (level: "INFO" | "WARN" | "ERROR", msg: string, meta?: object) => Promise<void>
): Promise<SyncReferenceResult> {
  const token = await getValidQboAccessToken(orgId);
  if (!token) throw new Error("No QBO connection");

  // Fetch company info (home currency, multi-currency)
  try {
    const companyInfo = await fetchQboCompanyInfo(token.realmId, token.accessToken);
    await prisma.accountingConnection.updateMany({
      where: { orgId, provider: "QUICKBOOKS_ONLINE" },
      data: {
        homeCurrency: companyInfo.homeCurrency,
        multiCurrencyEnabled: companyInfo.multiCurrencyEnabled,
      },
    });
    await log("INFO", `Company: home=${companyInfo.homeCurrency} multiCurrency=${companyInfo.multiCurrencyEnabled}`);
  } catch (e) {
    await log("WARN", `Could not fetch company info: ${(e as Error).message}`);
  }

  let accountsImported = 0;
  let vendorsImported = 0;
  let classesImported = 0;

  const opts = { realmId: token.realmId, accessToken: token.accessToken };

  // Fetch Accounts (Chart of Accounts)
  try {
    const accountRes = (await qboQuery<{ QueryResponse?: { Account?: Array<{ Id: string; Name: string; AccountType?: string }> } }>(
      { ...opts, query: "SELECT * FROM Account WHERE Active = true MAXRESULTS 1000" }
    )) as { QueryResponse?: { Account?: Array<{ Id: string; Name: string; AccountType?: string }> } };
    const accounts = accountRes?.QueryResponse?.Account ?? [];
    for (const a of accounts) {
      await prisma.orgExternalGLAccount.upsert({
        where: { orgId_provider_remoteId: { orgId, provider: "QUICKBOOKS_ONLINE", remoteId: String(a.Id) } },
        create: { orgId, provider: "QUICKBOOKS_ONLINE", remoteId: String(a.Id), remoteName: a.Name, accountType: a.AccountType, syncJobId: jobId },
        update: { remoteName: a.Name, accountType: a.AccountType },
      });
      accountsImported++;
    }
    await log("INFO", `Imported ${accounts.length} accounts`, { count: accounts.length });
  } catch (e) {
    await log("ERROR", `Account import failed: ${(e as Error).message}`);
    throw e;
  }

  // Vendors: created/linked during bill export. Reference import only caches accounts for GL dropdown.
  return { accountsImported, vendorsImported, classesImported };
}
