/**
 * Fetch QBO Company info: home currency, multi-currency status.
 */
import { qboRequest } from "../qbo/client";

export interface QboCompanyInfo {
  homeCurrency: string;
  multiCurrencyEnabled: boolean;
}

export async function fetchQboCompanyInfo(
  realmId: string,
  accessToken: string
): Promise<QboCompanyInfo> {
  const res = (await qboRequest<{ CompanyInfo?: { CompanyName?: string; Country?: string; CurrencyCode?: string } }>({
    realmId,
    accessToken,
    path: "/companyinfo/" + realmId,
  })) as { CompanyInfo?: { CurrencyCode?: string } };

  const currencyCode = res?.CompanyInfo?.CurrencyCode ?? "USD";

  // QBO multi-currency: check Preferences. See https://developer.intuit.com/app/developer/qbo/docs/api/accounting/most-commonly-used/preference
  let multiCurrencyEnabled = false;
  try {
    const prefs = (await qboRequest<{ Preferences?: { MultiCurrencyEnabled?: boolean } }>({
      realmId,
      accessToken,
      path: "/preferences",
    })) as { Preferences?: { MultiCurrencyEnabled?: boolean } };
    multiCurrencyEnabled = prefs?.Preferences?.MultiCurrencyEnabled ?? false;
  } catch {
    // Preferences may not be available; assume single currency
  }

  return { homeCurrency: currencyCode, multiCurrencyEnabled };
}
