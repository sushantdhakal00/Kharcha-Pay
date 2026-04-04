import { PayoutMethodType } from "@prisma/client";

export interface RailValidationInput {
  rail: PayoutMethodType;
  currency: string;
  profile: Record<string, unknown> | null;
  amountMinor: bigint | number;
}

export interface FieldError {
  field: string;
  message: string;
}

export class RailValidationError extends Error {
  code = "RAIL_VALIDATION_ERROR" as const;
  fieldErrors: FieldError[];

  constructor(rail: string, fieldErrors: FieldError[]) {
    const fields = fieldErrors.map((e) => `${e.field}: ${e.message}`).join("; ");
    super(`Validation failed for ${rail}: ${fields}`);
    this.name = "RailValidationError";
    this.fieldErrors = fieldErrors;
  }
}

function hasField(
  profile: Record<string, unknown> | null,
  key: string
): boolean {
  if (!profile) return false;
  const val = profile[key];
  return val !== undefined && val !== null && val !== "";
}

function validateBankWire(
  profile: Record<string, unknown> | null,
  _currency: string
): FieldError[] {
  const errors: FieldError[] = [];

  const hasIban = hasField(profile, "iban") || hasField(profile, "maskedIban");
  const hasAccountRouting =
    (hasField(profile, "accountNumber") || hasField(profile, "maskedAccount")) &&
    hasField(profile, "routingNumber");

  if (!hasIban && !hasAccountRouting) {
    errors.push({
      field: "accountNumber",
      message:
        "BANK_WIRE requires either IBAN or accountNumber + routingNumber",
    });
  }

  if (
    !hasField(profile, "billingName") &&
    !hasField(profile, "beneficiaryName")
  ) {
    errors.push({
      field: "billingName",
      message: "Beneficiary name is required for BANK_WIRE",
    });
  }

  if (
    !hasField(profile, "country") &&
    !hasField(profile, "billingCountry") &&
    !hasField(profile, "bankCountry")
  ) {
    errors.push({
      field: "country",
      message: "Country is required for BANK_WIRE",
    });
  }

  return errors;
}

function validateAch(
  profile: Record<string, unknown> | null,
  currency: string
): FieldError[] {
  const errors: FieldError[] = [];

  if (currency.toUpperCase() !== "USD") {
    errors.push({
      field: "currency",
      message: "ACH only supports USD",
    });
  }

  if (
    !hasField(profile, "accountNumber") &&
    !hasField(profile, "maskedAccount")
  ) {
    errors.push({
      field: "accountNumber",
      message: "Account number is required for ACH",
    });
  }

  if (!hasField(profile, "routingNumber")) {
    errors.push({
      field: "routingNumber",
      message: "Routing number is required for ACH",
    });
  }

  if (!hasField(profile, "accountType")) {
    errors.push({
      field: "accountType",
      message:
        "Account type (checking/savings) is required for ACH",
    });
  }

  return errors;
}

function validateLocal(
  profile: Record<string, unknown> | null,
  _currency: string
): FieldError[] {
  const errors: FieldError[] = [];

  if (
    !hasField(profile, "country") &&
    !hasField(profile, "bankCountry") &&
    !hasField(profile, "billingCountry")
  ) {
    errors.push({
      field: "country",
      message: "Country is required for LOCAL rail",
    });
  }

  if (!hasField(profile, "bankCode")) {
    errors.push({
      field: "bankCode",
      message: "Bank code is required for LOCAL rail",
    });
  }

  if (
    !hasField(profile, "accountNumber") &&
    !hasField(profile, "maskedAccount")
  ) {
    errors.push({
      field: "accountNumber",
      message: "Account number is required for LOCAL rail",
    });
  }

  return errors;
}

const RAIL_VALIDATORS: Record<
  PayoutMethodType,
  (profile: Record<string, unknown> | null, currency: string) => FieldError[]
> = {
  BANK_WIRE: validateBankWire,
  ACH: validateAch,
  LOCAL: validateLocal,
};

export function validatePayoutRailInput(input: RailValidationInput): void {
  const { rail, currency, profile, amountMinor } = input;
  const errors: FieldError[] = [];

  if (Number(amountMinor) <= 0) {
    errors.push({ field: "amountMinor", message: "Amount must be positive" });
  }

  const validator = RAIL_VALIDATORS[rail];
  if (!validator) {
    errors.push({
      field: "rail",
      message: `Unknown rail "${rail}"`,
    });
  } else {
    errors.push(...validator(profile, currency));
  }

  if (errors.length > 0) {
    throw new RailValidationError(rail, errors);
  }
}

export function getRequiredFieldsForRail(
  rail: PayoutMethodType
): string[] {
  switch (rail) {
    case PayoutMethodType.BANK_WIRE:
      return ["accountNumber/iban", "billingName", "country"];
    case PayoutMethodType.ACH:
      return ["accountNumber", "routingNumber", "accountType"];
    case PayoutMethodType.LOCAL:
      return ["country", "bankCode", "accountNumber"];
    default:
      return [];
  }
}
