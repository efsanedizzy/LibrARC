import { type Address } from "viem";

import { type ArcTokenReadIssue } from "./token-api";

export const ARC_TRADE_API_ERROR_CODES = [
  "INVALID_ADDRESS",
  "INVALID_REQUEST",
  "INVALID_AMOUNT",
  "INPUT_TOO_LARGE",
  "TOKEN_NOT_REGISTERED",
  "POOL_NOT_RESOLVED",
  "POOL_NOT_REGISTERED",
  "POOL_TOKEN_MISMATCH",
  "INVALID_QUOTE_ASSET",
  "RPC_UNAVAILABLE",
  "CONTRACT_READ_FAILED",
  "SIMULATION_REVERTED"
] as const;

export type ArcTradeApiErrorCode = (typeof ARC_TRADE_API_ERROR_CODES)[number];

export type ArcTradeDecodedRevert = {
  errorName?: string;
  message: string;
  reason?: string;
  signature?: string;
  args?: unknown[];
};

export type ArcTradeApiError = {
  ok: false;
  code: ArcTradeApiErrorCode;
  message: string;
  details: ArcTokenReadIssue[];
  revert?: ArcTradeDecodedRevert;
};

export type ArcSerializedCurveState = {
  realUsdcReserve: string;
  realTokenReserve: string;
  virtualUsdcReserve: string;
  virtualTokenReserve: string;
  accruedProtocolFees: string;
};

export type ArcBuyQuoteSuccess = {
  ok: true;
  kind: "buy-quote";
  tokenAddress: Address;
  poolAddress: Address;
  walletAddress: Address;
  usdcAmountIn: string;
  reachesGraduationThreshold: boolean;
  quote: {
    fee: string;
    netUsdcIn: string;
    tokenAmountOut: string;
    nextState: ArcSerializedCurveState;
  };
};

export type ArcSellQuoteSuccess = {
  ok: true;
  kind: "sell-quote";
  tokenAddress: Address;
  poolAddress: Address;
  walletAddress: Address;
  tokenAmountIn: string;
  quote: {
    fee: string;
    grossUsdcAmountOut: string;
    netUsdcAmountOut: string;
    nextState: ArcSerializedCurveState;
  };
};

export type ArcApproveSimulationSuccess = {
  ok: true;
  kind: "approve-simulation";
  tokenAddress: Address;
  poolAddress: Address;
  walletAddress: Address;
  asset: "usdc" | "token";
  assetAddress: Address;
  amount: string;
  spender: Address;
  result: boolean;
};

export type ArcBuySimulationSuccess = {
  ok: true;
  kind: "buy-simulation";
  tokenAddress: Address;
  poolAddress: Address;
  walletAddress: Address;
  recipient: Address;
  usdcAmountIn: string;
  minTokenAmountOut: string;
  deadline: string;
  tokenAmountOut: string;
};

export type ArcSellSimulationSuccess = {
  ok: true;
  kind: "sell-simulation";
  tokenAddress: Address;
  poolAddress: Address;
  walletAddress: Address;
  recipient: Address;
  tokenAmountIn: string;
  minUsdcAmountOut: string;
  deadline: string;
  netUsdcAmountOut: string;
};

export type ArcBuyQuoteResponse = ArcTradeApiError | ArcBuyQuoteSuccess;
export type ArcSellQuoteResponse = ArcTradeApiError | ArcSellQuoteSuccess;
export type ArcApproveSimulationResponse = ArcTradeApiError | ArcApproveSimulationSuccess;
export type ArcBuySimulationResponse = ArcTradeApiError | ArcBuySimulationSuccess;
export type ArcSellSimulationResponse = ArcTradeApiError | ArcSellSimulationSuccess;

export function buildArcTradeApiPath(
  tokenAddress: string,
  endpoint: "quote-buy" | "quote-sell" | "simulate-buy" | "simulate-sell" | "simulate-approve"
) {
  return `/api/arc/token/${encodeURIComponent(tokenAddress)}/${endpoint}`;
}

export function isArcTradeApiError(value: unknown): value is ArcTradeApiError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcTradeApiError>;

  return candidate.ok === false && typeof candidate.code === "string";
}

export function isArcBuyQuoteSuccess(value: unknown): value is ArcBuyQuoteSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcBuyQuoteSuccess>;

  return candidate.ok === true && candidate.kind === "buy-quote";
}

export function isArcSellQuoteSuccess(value: unknown): value is ArcSellQuoteSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcSellQuoteSuccess>;

  return candidate.ok === true && candidate.kind === "sell-quote";
}

export function isArcApproveSimulationSuccess(
  value: unknown
): value is ArcApproveSimulationSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcApproveSimulationSuccess>;

  return candidate.ok === true && candidate.kind === "approve-simulation";
}

export function isArcBuySimulationSuccess(value: unknown): value is ArcBuySimulationSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcBuySimulationSuccess>;

  return candidate.ok === true && candidate.kind === "buy-simulation";
}

export function isArcSellSimulationSuccess(value: unknown): value is ArcSellSimulationSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcSellSimulationSuccess>;

  return candidate.ok === true && candidate.kind === "sell-simulation";
}
