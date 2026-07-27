import { isAddress } from "viem";

import type { LaunchFieldName, LaunchFormErrors, LaunchFormValues } from "./types";

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
const VALID_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_PURCHASE_VALUE = 1_000_000;

function getTrimmedValue(value: string) {
  return value.trim();
}

function parseUrl(value: string) {
  try {
    return new URL(getTrimmedValue(value));
  } catch {
    return null;
  }
}

function hasSinglePathSegment(url: URL) {
  return url.pathname.split("/").filter(Boolean).length === 1;
}

export function sanitizeSymbol(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
}

export function sanitizePurchaseInput(value: string) {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole = "", ...fractionParts] = cleaned.split(".");

  if (fractionParts.length === 0) {
    return cleaned;
  }

  return `${whole}.${fractionParts.join("")}`;
}

export function getDisplayValue(value: string) {
  return getTrimmedValue(value);
}

export function validateField(field: LaunchFieldName, values: LaunchFormValues) {
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
      if (!values.symbol) {
        return "Token symbol is required.";
      }

      if (values.symbol.length < 2 || values.symbol.length > 10) {
        return "Token symbol must be between 2 and 10 characters.";
      }

      if (!/^[A-Z0-9]+$/.test(values.symbol)) {
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
    case "logo": {
      if (!values.logoFile) {
        return "A token logo is required.";
      }

      if (!VALID_LOGO_TYPES.has(values.logoFile.type)) {
        return "Logo must be a PNG, JPEG, or WebP image.";
      }

      if (values.logoFile.size > MAX_LOGO_SIZE_BYTES) {
        return "Logo must be 2 MB or smaller.";
      }

      return null;
    }
    case "website": {
      const trimmedWebsite = getTrimmedValue(values.website);

      if (!trimmedWebsite) {
        return null;
      }

      const url = parseUrl(trimmedWebsite);

      if (!url || url.protocol !== "https:") {
        return "Website must be a valid HTTPS URL.";
      }

      return null;
    }
    case "twitter": {
      const trimmedTwitter = getTrimmedValue(values.twitter);

      if (!trimmedTwitter) {
        return null;
      }

      const url = parseUrl(trimmedTwitter);
      const validHosts = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);

      if (
        !url ||
        url.protocol !== "https:" ||
        !validHosts.has(url.hostname) ||
        !hasSinglePathSegment(url)
      ) {
        return "Enter a valid X or Twitter profile URL.";
      }

      return null;
    }
    case "telegram": {
      const trimmedTelegram = getTrimmedValue(values.telegram);

      if (!trimmedTelegram) {
        return null;
      }

      const url = parseUrl(trimmedTelegram);
      const validHosts = new Set(["t.me", "www.t.me", "telegram.me", "www.telegram.me"]);

      if (
        !url ||
        url.protocol !== "https:" ||
        !validHosts.has(url.hostname) ||
        !hasSinglePathSegment(url)
      ) {
        return "Enter a valid Telegram URL.";
      }

      return null;
    }
    case "initialPurchase": {
      const trimmedPurchase = getTrimmedValue(values.initialPurchase);

      if (!trimmedPurchase) {
        return null;
      }

      const parsedValue = Number(trimmedPurchase);

      if (!Number.isFinite(parsedValue)) {
        return "Initial creator purchase must be a valid number.";
      }

      if (parsedValue < 0) {
        return "Initial creator purchase cannot be negative.";
      }

      if (parsedValue > MAX_PURCHASE_VALUE) {
        return "Initial creator purchase cannot exceed 1000000 USDC.";
      }

      return null;
    }
    case "creatorWallet": {
      const trimmedCreatorWallet = getTrimmedValue(values.creatorWallet);

      if (!trimmedCreatorWallet) {
        return null;
      }

      if (!isAddress(trimmedCreatorWallet)) {
        return "Creator wallet must be a valid EVM address.";
      }

      return null;
    }
  }
}

export function getAllErrors(values: LaunchFormValues) {
  const fields: LaunchFieldName[] = [
    "name",
    "symbol",
    "description",
    "logo",
    "website",
    "twitter",
    "telegram",
    "initialPurchase",
    "creatorWallet"
  ];

  return fields.reduce<LaunchFormErrors>((errors, field) => {
    const error = validateField(field, values);

    if (error) {
      errors[field] = error;
    }

    return errors;
  }, {});
}
