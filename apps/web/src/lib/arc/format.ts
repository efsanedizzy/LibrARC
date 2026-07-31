import { formatUnits, type Address } from "viem";

export const ARC_USDC_DECIMALS = 6;
export const LIBRARC_TOKEN_DECIMALS = 18;

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
