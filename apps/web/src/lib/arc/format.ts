import { formatUnits, type Address } from "viem";

export const ARC_USDC_DECIMALS = 6;
export const LIBRARC_TOKEN_DECIMALS = 18;

const COMPACT_UNITS = [
  { divisor: 1_000_000_000n, suffix: "B" },
  { divisor: 1_000_000n, suffix: "M" },
  { divisor: 1_000n, suffix: "K" }
] as const;

const ARC_POOL_STATUS_LABELS = {
  0: "Uninitialized",
  1: "Active",
  2: "Graduation pending",
  3: "Graduated"
} as const;

export function formatCompactAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-5)}`;
}

export function formatTokenAmount(value: bigint, decimals: number, maxFractionDigits = 6) {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  const groupedWhole = BigInt(whole || "0").toLocaleString("en-US");
  const trimmedFraction = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");

  return trimmedFraction ? `${groupedWhole}.${trimmedFraction}` : groupedWhole;
}

function formatScaledCompactNumber(value: bigint, fractionDigits: number) {
  if (fractionDigits === 0) {
    return value.toString();
  }

  const divisor = 10n ** BigInt(fractionDigits);
  const whole = value / divisor;
  const fraction = (value % divisor).toString().padStart(fractionDigits, "0").replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function formatCompactTokenAmount(value: bigint, decimals: number) {
  const negative = value < 0n;
  const absoluteValue = negative ? -value : value;
  const base = 10n ** BigInt(decimals);

  let compactValue: string | null = null;

  for (let index = 0; index < COMPACT_UNITS.length; index += 1) {
    let unit = COMPACT_UNITS[index];
    let unitDivisor = unit.divisor * base;

    if (absoluteValue < unitDivisor) {
      continue;
    }

    while (true) {
      const whole = absoluteValue / unitDivisor;
      const fractionDigits = whole >= 100n ? 0 : whole >= 10n ? 1 : 2;
      const roundingScale = 10n ** BigInt(fractionDigits);
      const rounded = (absoluteValue * roundingScale + unitDivisor / 2n) / unitDivisor;

      if (rounded >= 1000n * roundingScale && index > 0) {
        index -= 1;
        unit = COMPACT_UNITS[index];
        unitDivisor = unit.divisor * base;
        continue;
      }

      compactValue = `${formatScaledCompactNumber(rounded, fractionDigits)}${unit.suffix}`;
      break;
    }

    if (compactValue) {
      break;
    }
  }

  const formatted = compactValue ?? formatTokenAmount(absoluteValue, decimals, 2);

  return negative ? `-${formatted}` : formatted;
}

export function formatCompactLaunchTokenAmount(value: bigint) {
  return formatCompactTokenAmount(value, LIBRARC_TOKEN_DECIMALS);
}

export function formatCompactUsdcAmount(value: bigint) {
  return formatCompactTokenAmount(value, ARC_USDC_DECIMALS);
}

export function formatLaunchTokenAmount(value: bigint) {
  return formatTokenAmount(value, LIBRARC_TOKEN_DECIMALS);
}

export function formatUsdcAmount(value: bigint) {
  return formatTokenAmount(value, ARC_USDC_DECIMALS);
}

export function getPoolStatusLabel(status: bigint | number | undefined) {
  const normalizedStatus = Number(status ?? 0) as keyof typeof ARC_POOL_STATUS_LABELS;

  return ARC_POOL_STATUS_LABELS[normalizedStatus] ?? "Unknown";
}

export function getGraduationPercentage(
  realUsdcReserve: bigint | undefined,
  remainingGraduationCapacity: bigint | undefined
) {
  const reserve = realUsdcReserve ?? 0n;
  const remaining = remainingGraduationCapacity ?? 0n;
  const threshold = reserve + remaining;

  if (threshold === 0n) {
    return 0;
  }

  const rawPercentage = Number((reserve * 10_000n) / threshold) / 100;

  return Math.max(0, Math.min(100, rawPercentage));
}

export function formatPercentage(value: number) {
  return `${value.toFixed(value % 1 === 0 ? 0 : 2)}%`;
}

export function buildExplorerAddressUrl(explorerUrl: string, address: Address) {
  return `${explorerUrl}/address/${address}`;
}
