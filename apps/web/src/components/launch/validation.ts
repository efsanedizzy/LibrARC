import { buildLaunchMetadata, exceedsLaunchMetadataLimit } from "../../lib/arc/launch-metadata";

import type { LaunchFieldName, LaunchFormErrors, LaunchFormValues } from "./types";

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
  const fields: LaunchFieldName[] = ["name", "symbol", "description", "metadata"];

  return fields.reduce<LaunchFormErrors>((errors, field) => {
    const error = validateField(field, values, maxMetadataUriLength);

    if (error) {
      errors[field] = error;
    }

    return errors;
  }, {});
}
