import { type Address, formatUnits } from "viem";

import { ARC_USDC_DECIMALS, formatTokenAmount } from "./format";

export const ARC_BPS_DENOMINATOR = 10_000n;
export const ARC_BPS_DENOMINATOR_NUMBER = 10_000;
export const DEFAULT_SLIPPAGE_BPS = 100;
export const MIN_SLIPPAGE_BPS = 10;
export const MAX_SLIPPAGE_BPS = 500;
export const DEFAULT_DEADLINE_MINUTES = 10;
export const MAX_DECIMAL_INPUT_LENGTH = 80;
export const SLIPPAGE_PRESET_BPS = [50, 100, 200] as const;

export type DecimalParseErrorCode =
  "EMPTY" | "INPUT_TOO_LONG" | "NEGATIVE" | "MALFORMED" | "TOO_MANY_DECIMALS" | "ZERO";

export class DecimalParseError extends Error {
  code: DecimalParseErrorCode;

  constructor(code: DecimalParseErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function parseDecimalAmount(value: string, decimals: number, label: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new DecimalParseError("EMPTY", `${label} is required.`);
  }

  if (trimmed.length > MAX_DECIMAL_INPUT_LENGTH) {
    throw new DecimalParseError("INPUT_TOO_LONG", `${label} is too long.`);
  }

  if (trimmed.startsWith("-")) {
    throw new DecimalParseError("NEGATIVE", `${label} cannot be negative.`);
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new DecimalParseError("MALFORMED", `${label} must be a valid decimal value.`);
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");

  if (fractionPart.length > decimals) {
    throw new DecimalParseError(
      "TOO_MANY_DECIMALS",
      `${label} supports at most ${decimals} decimal places.`
    );
  }

  const normalizedWhole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const paddedFraction = fractionPart.padEnd(decimals, "0");
  const normalized = `${normalizedWhole}${paddedFraction}`.replace(/^0+(?=\d)/, "") || "0";
  const amount = BigInt(normalized);

  if (amount <= 0n) {
    throw new DecimalParseError("ZERO", `${label} must be greater than zero.`);
  }

  return amount;
}

export function parseSlippagePercentToBps(value: string) {
  const basisPoints = Number(parseDecimalAmount(value, 2, "Slippage"));

  if (basisPoints < MIN_SLIPPAGE_BPS || basisPoints > MAX_SLIPPAGE_BPS) {
    throw new DecimalParseError(
      "MALFORMED",
      `Slippage must stay between ${formatSlippageBps(MIN_SLIPPAGE_BPS)} and ${formatSlippageBps(MAX_SLIPPAGE_BPS)}.`
    );
  }

  return basisPoints;
}

export function calculateMinimumOutput(amountOut: bigint, slippageBps: number) {
  return (amountOut * BigInt(ARC_BPS_DENOMINATOR_NUMBER - slippageBps)) / ARC_BPS_DENOMINATOR;
}

export function formatSlippageBps(slippageBps: number) {
  return `${(slippageBps / 100).toFixed(2)}%`;
}

export function getFreshDeadlineSeconds(minutes = DEFAULT_DEADLINE_MINUTES) {
  return BigInt(Math.floor(Date.now() / 1_000) + minutes * 60);
}

export function buildExplorerTransactionUrl(explorerUrl: string, hash: string) {
  return `${explorerUrl}/tx/${hash}`;
}

export function formatBalanceWithSymbol(value: bigint, decimals: number, symbol: string) {
  return `${formatTokenAmount(value, decimals)} ${symbol}`;
}

export function formatTokenBalance(value: bigint, decimals: number) {
  const [whole, fraction = ""] = formatUnits(value, decimals).split(".");
  const groupedWhole = BigInt(whole || "0").toLocaleString("en-US");
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");

  return trimmedFraction ? `${groupedWhole}.${trimmedFraction}` : groupedWhole;
}

export function getUsdcAmountLabel(value: bigint) {
  return formatBalanceWithSymbol(value, ARC_USDC_DECIMALS, "USDC");
}

export function shortenHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

export function isWalletRejection(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const numericCode =
    typeof error === "object" && error !== null && "code" in error
      ? Number((error as { code?: unknown }).code)
      : Number.NaN;

  return (
    numericCode === 4001 ||
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("rejected the request")
  );
}

export async function wait(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export type WalletReceipt = {
  status?: string;
  transactionHash?: string;
};

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export async function waitForWalletTransactionReceipt(
  provider: Eip1193Provider,
  hash: Address | `0x${string}`,
  {
    pollIntervalMs = 2_000,
    timeoutMs = 180_000
  }: {
    pollIntervalMs?: number;
    timeoutMs?: number;
  } = {}
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const receipt = (await provider.request({
      method: "eth_getTransactionReceipt",
      params: [hash]
    })) as WalletReceipt | null;

    if (receipt) {
      return receipt;
    }

    await wait(pollIntervalMs);
  }

  throw new Error("Timed out while waiting for the wallet transaction receipt.");
}
