import { type Address } from "viem";

export const ARC_TOKEN_API_ERROR_CODES = [
  "INVALID_ADDRESS",
  "POOL_TOKEN_MISMATCH",
  "INVALID_QUOTE_ASSET",
  "TOKEN_NOT_REGISTERED",
  "POOL_NOT_RESOLVED",
  "POOL_NOT_REGISTERED",
  "RPC_UNAVAILABLE",
  "CONTRACT_READ_FAILED"
] as const;

export type ArcTokenApiErrorCode = (typeof ARC_TOKEN_API_ERROR_CODES)[number];

export type ArcTokenReadIssue = {
  label: string;
  message: string;
};

export type ArcTokenApiError = {
  ok: false;
  code: ArcTokenApiErrorCode;
  message: string;
  details: ArcTokenReadIssue[];
};

export type ArcTokenApiSuccess = {
  ok: true;
  token: {
    address: Address;
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: string;
  };
  pool: {
    address: Address;
    launchToken: Address;
    quoteAsset: Address;
    factory: Address;
    feeVault: Address;
    status: number;
    statusLabel: string;
    canBuy: boolean;
    canSell: boolean;
    buysPaused: boolean;
    allTradingPaused: boolean;
    curveState: {
      realUsdcReserve: string;
      realTokenReserve: string;
      virtualUsdcReserve: string;
      virtualTokenReserve: string;
      accruedProtocolFees: string;
    };
    remainingGraduationCapacity: string;
    graduationProgress: number;
  };
  deployment: {
    factoryAddress: Address;
    feeVaultAddress: Address;
    usdcAddress: Address;
    stagingAdapterAddress: Address;
    launchCount?: string;
    paused?: boolean;
    feeVault?: Address;
    liquidityAdapter?: Address;
    liquidityRecipient?: Address;
    treasury?: Address;
  };
  wallet?: {
    address: Address;
    tokenBalance?: string;
    tokenAllowanceToPool?: string;
    usdcBalance?: string;
    usdcAllowanceToPool?: string;
  };
  warnings: ArcTokenReadIssue[];
};

export type ArcTokenApiResponse = ArcTokenApiError | ArcTokenApiSuccess;

export function buildArcTokenApiPath(tokenAddress: string, walletAddress?: string) {
  const path = `/api/arc/token/${encodeURIComponent(tokenAddress)}`;

  if (!walletAddress) {
    return path;
  }

  const searchParams = new URLSearchParams({ wallet: walletAddress });

  return `${path}?${searchParams.toString()}`;
}

export function isArcTokenApiError(value: unknown): value is ArcTokenApiError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcTokenApiError>;

  return candidate.ok === false && typeof candidate.code === "string";
}

export function isArcTokenApiSuccess(value: unknown): value is ArcTokenApiSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcTokenApiSuccess>;

  return candidate.ok === true && typeof candidate.token?.address === "string";
}
