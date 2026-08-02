import {
  ARC_BPS_DENOMINATOR,
  ARC_BPS_DENOMINATOR_NUMBER,
  MAX_DECIMAL_INPUT_LENGTH
} from "./trading";

export const LIBRARC_FIXED_TOKEN_SUPPLY = 1_000_000_000n * 10n ** 18n;

export type LaunchInitialBuyCurveState = {
  accruedProtocolFees: bigint;
  realTokenReserve: bigint;
  realUsdcReserve: bigint;
  virtualTokenReserve: bigint;
  virtualUsdcReserve: bigint;
};

export type LaunchInitialBuyQuote = {
  fee: bigint;
  netUsdcIn: bigint;
  reachesGraduationThreshold: boolean;
  tokenAmountOut: bigint;
  nextState: LaunchInitialBuyCurveState;
};

export class LaunchInitialBuyQuoteError extends Error {
  args?: bigint[];
  errorName: string;

  constructor(errorName: string, message: string, args?: bigint[]) {
    super(message);
    this.errorName = errorName;
    this.args = args;
  }
}

export function createInitialLaunchCurveState({
  totalTokenSupply = LIBRARC_FIXED_TOKEN_SUPPLY,
  virtualTokenReserve,
  virtualUsdcReserve
}: {
  totalTokenSupply?: bigint;
  virtualTokenReserve: bigint;
  virtualUsdcReserve: bigint;
}): LaunchInitialBuyCurveState {
  if (virtualUsdcReserve <= 0n) {
    throw new LaunchInitialBuyQuoteError(
      "ZeroVirtualUsdcReserve",
      "The initial virtual USDC reserve must be greater than zero."
    );
  }

  if (virtualTokenReserve <= 0n) {
    throw new LaunchInitialBuyQuoteError(
      "ZeroVirtualTokenReserve",
      "The initial virtual token reserve must be greater than zero."
    );
  }

  if (totalTokenSupply <= 0n) {
    throw new LaunchInitialBuyQuoteError(
      "InvalidTotalSupply",
      "The fixed launch-token supply must be greater than zero."
    );
  }

  return {
    realUsdcReserve: 0n,
    realTokenReserve: totalTokenSupply,
    virtualUsdcReserve,
    virtualTokenReserve,
    accruedProtocolFees: 0n
  };
}

export function calculateMinimumTokenOutput(tokenAmountOut: bigint, slippageBps: number) {
  return (tokenAmountOut * BigInt(ARC_BPS_DENOMINATOR_NUMBER - slippageBps)) / ARC_BPS_DENOMINATOR;
}

export function getNormalizedInitialPurchaseAmount(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed.replace(/^0+(?=\d)/, "") || "0";
}

export function parseOptionalInitialPurchaseUsdcAmount(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > MAX_DECIMAL_INPUT_LENGTH) {
    throw new Error("Initial purchase amount is too long.");
  }

  if (trimmed.startsWith("-")) {
    throw new Error("Initial purchase amount cannot be negative.");
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("Initial purchase amount must be a valid USDC value.");
  }

  const [wholePart, fractionPart = ""] = trimmed.split(".");

  if (fractionPart.length > 6) {
    throw new Error("Initial purchase amount supports at most 6 decimal places.");
  }

  const normalizedWhole = wholePart.replace(/^0+(?=\d)/, "") || "0";
  const normalized =
    `${normalizedWhole}${fractionPart.padEnd(6, "0")}`.replace(/^0+(?=\d)/, "") || "0";

  return BigInt(normalized);
}

function ceilDiv(dividend: bigint, divisor: bigint) {
  if (divisor <= 0n) {
    throw new LaunchInitialBuyQuoteError(
      "InvalidDivisor",
      "The ceiling-division divisor must be greater than zero."
    );
  }

  return dividend / divisor + (dividend % divisor === 0n ? 0n : 1n);
}

function mulDivUp(left: bigint, right: bigint, denominator: bigint) {
  return ceilDiv(left * right, denominator);
}

export function quoteInitialLaunchBuy({
  buyFeeBps,
  graduationThreshold,
  state,
  usdcAmountIn
}: {
  buyFeeBps: bigint;
  graduationThreshold: bigint;
  state: LaunchInitialBuyCurveState;
  usdcAmountIn: bigint;
}): LaunchInitialBuyQuote {
  if (usdcAmountIn <= 0n) {
    throw new LaunchInitialBuyQuoteError(
      "ZeroInput",
      "The initial purchase amount must be greater than zero."
    );
  }

  if (buyFeeBps < 0n || buyFeeBps >= ARC_BPS_DENOMINATOR) {
    throw new LaunchInitialBuyQuoteError(
      "InvalidFeeBps",
      "The buy fee basis points must stay below 10,000."
    );
  }

  if (graduationThreshold <= 0n) {
    throw new LaunchInitialBuyQuoteError(
      "ZeroGraduationThreshold",
      "The graduation threshold must be greater than zero."
    );
  }

  const fee = (usdcAmountIn * buyFeeBps) / ARC_BPS_DENOMINATOR;
  const netUsdcIn = usdcAmountIn - fee;

  if (netUsdcIn <= 0n) {
    throw new LaunchInitialBuyQuoteError(
      "ZeroInput",
      "The net initial-purchase USDC amount must be greater than zero after fees."
    );
  }

  const effectiveUsdcReserve = state.realUsdcReserve + state.virtualUsdcReserve;
  const effectiveTokenReserve = state.realTokenReserve + state.virtualTokenReserve;

  if (effectiveUsdcReserve <= 0n) {
    throw new LaunchInitialBuyQuoteError(
      "ZeroEffectiveUsdcReserve",
      "The effective USDC reserve must be greater than zero."
    );
  }

  if (effectiveTokenReserve <= 0n) {
    throw new LaunchInitialBuyQuoteError(
      "ZeroEffectiveTokenReserve",
      "The effective token reserve must be greater than zero."
    );
  }

  const newEffectiveUsdcReserve = effectiveUsdcReserve + netUsdcIn;
  const newEffectiveTokenReserve = mulDivUp(
    effectiveUsdcReserve,
    effectiveTokenReserve,
    newEffectiveUsdcReserve
  );
  const tokenAmountOut = effectiveTokenReserve - newEffectiveTokenReserve;

  if (tokenAmountOut <= 0n) {
    throw new LaunchInitialBuyQuoteError(
      "ZeroOutput",
      "The initial purchase would return zero launch tokens."
    );
  }

  if (tokenAmountOut > state.realTokenReserve) {
    throw new LaunchInitialBuyQuoteError(
      "InsufficientRealTokenReserve",
      "The initial purchase would consume more launch tokens than the pool holds."
    );
  }

  const nextState: LaunchInitialBuyCurveState = {
    realUsdcReserve: state.realUsdcReserve + netUsdcIn,
    realTokenReserve: state.realTokenReserve - tokenAmountOut,
    virtualUsdcReserve: state.virtualUsdcReserve,
    virtualTokenReserve: state.virtualTokenReserve,
    accruedProtocolFees: state.accruedProtocolFees + fee
  };

  if (nextState.realUsdcReserve > graduationThreshold) {
    throw new LaunchInitialBuyQuoteError(
      "GraduationThresholdExceeded",
      "The initial purchase exceeds the remaining Arc USDC graduation capacity.",
      [state.realUsdcReserve, netUsdcIn, graduationThreshold]
    );
  }

  return {
    fee,
    netUsdcIn,
    tokenAmountOut,
    nextState,
    reachesGraduationThreshold: nextState.realUsdcReserve === graduationThreshold
  };
}
