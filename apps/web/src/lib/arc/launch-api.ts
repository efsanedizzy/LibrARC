import { type Address } from "viem";

import { type ArcTokenReadIssue } from "./token-api";

export const ARC_LAUNCH_API_ERROR_CODES = [
  "INVALID_ADDRESS",
  "INVALID_REQUEST",
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
  walletAddress: Address;
  factoryAddress: Address;
  request: {
    account: Address;
    address: Address;
    args: [string, string, string];
    functionName: "createLaunch";
  };
  simulation: {
    launchId: string;
    launchPool: Address;
    launchToken: Address;
  };
};

export type ArcLaunchConfigResponse = ArcLaunchApiError | ArcLaunchConfigSuccess;
export type ArcLaunchSimulationResponse = ArcLaunchApiError | ArcLaunchSimulationSuccess;

export function buildArcLaunchApiPath(endpoint: "config" | "simulate") {
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
