import { buildLaunchMetadata, exceedsLaunchMetadataLimit } from "../../lib/arc/launch-metadata";
import { MAX_DECIMAL_INPUT_LENGTH } from "../../lib/arc/trading";

import type { LaunchFieldName, LaunchFormErrors, LaunchFormValues } from "./types";

const MAX_INITIAL_PURCHASE_UNITS = 1_000_000n * 10n ** 6n;

function getTrimmedValue(value: string) {
  return value.trim();
}

export function getDisplayValue(value: string) {
  return getTrimmedValue(value);
}

export function getLaunchMetadataPreview(values: LaunchFormValues) {
  return buildLaunchMetadata({
    name: values.name,
    symbol: values.symbol,
    description: values.description
  });
}

export function validateField(
  field: LaunchFieldName,
  values: LaunchFormValues,
  maxMetadataUriLength: number | null = null
) {
  switch (field) {
    case "name": {
      const trimmedName = getTrimmedValue(values.name);

      if (!trimmedName) {
        return "Token name is required.";
      }

      if (trimmedName.length < 2 || trimmedName.length > 32) {
        return "Token name must be between 2 and 32 characters.";
      }

      return null;
    }
    case "symbol": {
      const trimmedSymbol = getTrimmedValue(values.symbol);

      if (!trimmedSymbol) {
        return "Token symbol is required.";
      }

      if (trimmedSymbol.length < 2 || trimmedSymbol.length > 10) {
        return "Token symbol must be between 2 and 10 characters.";
      }

      if (values.symbol !== trimmedSymbol || !/^[A-Z0-9]+$/.test(trimmedSymbol)) {
        return "Token symbol can contain only A-Z and 0-9.";
      }

      return null;
    }
    case "description": {
      const trimmedDescription = getTrimmedValue(values.description);

      if (!trimmedDescription) {
        return null;
      }

      if (trimmedDescription.length > 500) {
        return "Description must be 500 characters or fewer.";
      }

      return null;
    }
    case "initialPurchaseAmount": {
      if (!values.initialPurchaseEnabled) {
        return null;
      }

      const trimmedAmount = getTrimmedValue(values.initialPurchaseAmount);

      if (!trimmedAmount) {
        return null;
      }

      if (trimmedAmount.length > MAX_DECIMAL_INPUT_LENGTH) {
        return "Initial purchase amount is too long.";
      }

      if (trimmedAmount.startsWith("-")) {
        return "Initial purchase amount cannot be negative.";
      }

      if (!/^\d+(\.\d+)?$/.test(trimmedAmount)) {
        return "Initial purchase amount must be a valid USDC value.";
      }

      const [wholePart, fractionPart = ""] = trimmedAmount.split(".");

      if (fractionPart.length > 6) {
        return "Initial purchase amount supports at most 6 decimal places.";
      }

      const normalizedWhole = wholePart.replace(/^0+(?=\d)/, "") || "0";
      const normalized =
        `${normalizedWhole}${fractionPart.padEnd(6, "0")}`.replace(/^0+(?=\d)/, "") || "0";
      const amount = BigInt(normalized);

      if (amount > MAX_INITIAL_PURCHASE_UNITS) {
        return "Initial purchase amount must be 1,000,000 USDC or less.";
      }

      return null;
    }
    case "metadata": {
      if (maxMetadataUriLength === null) {
        return null;
      }

      const metadata = getLaunchMetadataPreview(values);

      if (exceedsLaunchMetadataLimit(metadata.uriByteLength, maxMetadataUriLength)) {
        return `Metadata URI exceeds the factory limit of ${maxMetadataUriLength} bytes.`;
      }

      return null;
    }
  }
}

export function getAllErrors(values: LaunchFormValues, maxMetadataUriLength: number | null = null) {
  const fields: LaunchFieldName[] = [
    "name",
    "symbol",
    "description",
    "initialPurchaseAmount",
    "metadata"
  ];

  return fields.reduce<LaunchFormErrors>((errors, field) => {
    const error = validateField(field, values, maxMetadataUriLength);

    if (error) {
      errors[field] = error;
    }

    return errors;
  }, {});
}
