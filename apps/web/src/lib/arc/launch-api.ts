import { type Address } from "viem";

import { type ArcTokenReadIssue } from "./token-api";

export const ARC_LAUNCH_API_ERROR_CODES = [
  "INVALID_ADDRESS",
  "INVALID_REQUEST",
  "INVALID_AMOUNT",
  "INVALID_METADATA",
  "INPUT_TOO_LARGE",
  "RPC_UNAVAILABLE",
  "CONTRACT_READ_FAILED",
  "SIMULATION_REVERTED"
] as const;

export type ArcLaunchApiErrorCode = (typeof ARC_LAUNCH_API_ERROR_CODES)[number];

export type ArcLaunchDecodedRevert = {
  args?: unknown[];
  errorName?: string;
  message: string;
  reason?: string;
  signature?: string;
};

export type ArcLaunchApiError = {
  ok: false;
  code: ArcLaunchApiErrorCode;
  details: ArcTokenReadIssue[];
  message: string;
  revert?: ArcLaunchDecodedRevert;
};

export type ArcLaunchConfigSuccess = {
  ok: true;
  kind: "launch-config";
  chainId: number;
  explorerUrl: string;
  factory: {
    address: Address;
    paused: boolean;
    quoteAsset: Address;
    feeVault: Address;
    liquidityAdapter: Address;
    liquidityRecipient: Address;
    buyFeeBps: string;
    sellFeeBps: string;
    graduationThreshold: string;
    virtualUsdcReserve: string;
    virtualTokenReserve: string;
    maxMetadataUriLength: string;
    launchCount: string;
  };
};

export type ArcLaunchSimulationSuccess = {
  ok: true;
  kind: "launch-simulation";
  mode: "createLaunch" | "createLaunchAndBuy";
  walletAddress: Address;
  factoryAddress: Address;
  request: {
    account: Address;
    address: Address;
    args: [string, string, string] | [string, string, string, string, string, string, Address];
    functionName: "createLaunch" | "createLaunchAndBuy";
  };
  simulation: {
    launchId: string;
    launchPool: Address;
    launchToken: Address;
    tokenAmountOut?: string;
  };
};

export type ArcLaunchInitialBuyQuoteSuccess = {
  ok: true;
  kind: "launch-initial-buy-quote";
  walletAddress: Address;
  factoryAddress: Address;
  quoteAssetAddress: Address;
  spender: Address;
  usdcAmountIn: string;
  reachesGraduationThreshold: boolean;
  quote: {
    fee: string;
    netUsdcIn: string;
    tokenAmountOut: string;
    nextState: {
      realUsdcReserve: string;
      realTokenReserve: string;
      virtualUsdcReserve: string;
      virtualTokenReserve: string;
      accruedProtocolFees: string;
    };
  };
};

export type ArcLaunchApproveSimulationSuccess = {
  ok: true;
  kind: "launch-approve-simulation";
  walletAddress: Address;
  assetAddress: Address;
  amount: string;
  spender: Address;
  result: boolean;
};

export type ArcLaunchConfigResponse = ArcLaunchApiError | ArcLaunchConfigSuccess;
export type ArcLaunchSimulationResponse = ArcLaunchApiError | ArcLaunchSimulationSuccess;
export type ArcLaunchInitialBuyQuoteResponse = ArcLaunchApiError | ArcLaunchInitialBuyQuoteSuccess;
export type ArcLaunchApproveSimulationResponse =
  ArcLaunchApiError | ArcLaunchApproveSimulationSuccess;

export function buildArcLaunchApiPath(
  endpoint: "config" | "quote-initial-buy" | "simulate" | "simulate-approve"
) {
  return `/api/arc/launch/${endpoint}`;
}

export function isArcLaunchApiError(value: unknown): value is ArcLaunchApiError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcLaunchApiError>;

  return candidate.ok === false && typeof candidate.code === "string";
}

export function isArcLaunchConfigSuccess(value: unknown): value is ArcLaunchConfigSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcLaunchConfigSuccess>;

  return candidate.ok === true && candidate.kind === "launch-config";
}

export function isArcLaunchSimulationSuccess(value: unknown): value is ArcLaunchSimulationSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcLaunchSimulationSuccess>;

  return candidate.ok === true && candidate.kind === "launch-simulation";
}

export function isArcLaunchInitialBuyQuoteSuccess(
  value: unknown
): value is ArcLaunchInitialBuyQuoteSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcLaunchInitialBuyQuoteSuccess>;

  return candidate.ok === true && candidate.kind === "launch-initial-buy-quote";
}

export function isArcLaunchApproveSimulationSuccess(
  value: unknown
): value is ArcLaunchApproveSimulationSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcLaunchApproveSimulationSuccess>;

  return candidate.ok === true && candidate.kind === "launch-approve-simulation";
}
