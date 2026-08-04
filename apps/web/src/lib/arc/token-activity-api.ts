import { type Address, type Hex } from "viem";

import { type ArcTokenReadIssue } from "./token-api";

export const ARC_TOKEN_ACTIVITY_ERROR_CODES = [
  "INVALID_ADDRESS",
  "UNREGISTERED_TOKEN",
  "POOL_NOT_RESOLVED",
  "INVALID_REQUEST",
  "RPC_UNAVAILABLE",
  "CONTRACT_READ_FAILED",
  "LOG_QUERY_LIMIT_REACHED",
  "PARTIAL_DATA"
] as const;

export type ArcTokenActivityErrorCode = (typeof ARC_TOKEN_ACTIVITY_ERROR_CODES)[number];

export type ArcTokenTradeActivityItem = {
  kind: "buy" | "sell";
  trader: Address;
  recipient?: Address;
  tokenAmount: string;
  grossUsdcAmount: string;
  netUsdcAmount: string;
  fee: string;
  transactionHash: Hex;
  blockNumber: string;
  logIndex: number;
  transactionIndex?: number;
  timestamp?: string;
  transactionExplorerUrl: string;
  poolExplorerUrl: string;
};

export type ArcTokenHolderRole = "contract" | "creator" | "pool";

export type ArcTokenHolderActivityItem = {
  rank: number;
  address: Address;
  balance: string;
  explorerUrl: string;
  role?: ArcTokenHolderRole;
  sharePercent?: string;
};

export type ArcTokenActivityApiError = {
  ok: false;
  code: ArcTokenActivityErrorCode;
  message: string;
  details: ArcTokenReadIssue[];
};

export type ArcTokenTradesActivitySuccess = {
  ok: true;
  tokenAddress: Address;
  poolAddress: Address;
  page: number;
  limit: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  startBlock: string;
  latestBlock: string;
  trades: ArcTokenTradeActivityItem[];
  warnings: ArcTokenReadIssue[];
};

export type ArcTokenHoldersActivitySuccess = {
  ok: true;
  tokenAddress: Address;
  poolAddress: Address;
  page: number;
  limit: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  startBlock: string;
  latestBlock: string;
  complete: boolean;
  holderCount?: number;
  totalSupply: string;
  holders: ArcTokenHolderActivityItem[];
  warnings: ArcTokenReadIssue[];
};

export type ArcTokenTradesActivityResponse =
  ArcTokenActivityApiError | ArcTokenTradesActivitySuccess;

export type ArcTokenHoldersActivityResponse =
  ArcTokenActivityApiError | ArcTokenHoldersActivitySuccess;

export function buildArcTokenActivityApiPath(
  tokenAddress: string,
  { limit, page }: { limit?: number; page?: number } = {}
) {
  const searchParams = new URLSearchParams();

  if (typeof page === "number") {
    searchParams.set("page", String(page));
  }

  if (typeof limit === "number") {
    searchParams.set("limit", String(limit));
  }

  const query = searchParams.toString();
  const basePath = `/api/arc/token/${encodeURIComponent(tokenAddress)}/activity`;

  return query ? `${basePath}?${query}` : basePath;
}

export function buildArcTokenHoldersApiPath(
  tokenAddress: string,
  { limit, page }: { limit?: number; page?: number } = {}
) {
  const searchParams = new URLSearchParams();

  if (typeof page === "number") {
    searchParams.set("page", String(page));
  }

  if (typeof limit === "number") {
    searchParams.set("limit", String(limit));
  }

  const query = searchParams.toString();
  const basePath = `/api/arc/token/${encodeURIComponent(tokenAddress)}/holders`;

  return query ? `${basePath}?${query}` : basePath;
}

export function isArcTokenActivityApiError(value: unknown): value is ArcTokenActivityApiError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcTokenActivityApiError>;

  return candidate.ok === false && typeof candidate.code === "string";
}

export function isArcTokenTradesActivitySuccess(
  value: unknown
): value is ArcTokenTradesActivitySuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcTokenTradesActivitySuccess>;

  return candidate.ok === true && Array.isArray(candidate.trades);
}

export function isArcTokenHoldersActivitySuccess(
  value: unknown
): value is ArcTokenHoldersActivitySuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcTokenHoldersActivitySuccess>;

  return candidate.ok === true && Array.isArray(candidate.holders);
}
