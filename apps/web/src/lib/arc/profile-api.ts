import { type Address, type Hex } from "viem";

import { type ArcTokenReadIssue } from "./token-api";

export const ARC_PROFILE_API_ERROR_CODES = [
  "INVALID_ADDRESS",
  "INVALID_REQUEST",
  "RPC_UNAVAILABLE",
  "CONTRACT_READ_FAILED"
] as const;

export const ARC_PROFILE_SORT_OPTIONS = ["newest", "oldest"] as const;

export type ArcProfileApiErrorCode = (typeof ARC_PROFILE_API_ERROR_CODES)[number];
export type ArcProfileSort = (typeof ARC_PROFILE_SORT_OPTIONS)[number];

export type ArcProfileLaunch = {
  canBuy?: boolean;
  canSell?: boolean;
  decimals?: number;
  graduationProgress?: number;
  launchId: string;
  name?: string;
  poolAddress: Address;
  poolExplorerUrl: string;
  poolStatus?: number;
  poolStatusLabel?: string;
  realUsdcReserve?: string;
  remainingGraduationCapacity?: string;
  symbol?: string;
  tokenAddress: Address;
  tokenExplorerUrl: string;
  tokenPageUrl: string;
  transactionExplorerUrl?: string;
  transactionHash?: Hex;
  walletTokenBalance?: string;
  warnings: ArcTokenReadIssue[];
};

export type ArcProfileApiError = {
  ok: false;
  code: ArcProfileApiErrorCode;
  details: ArcTokenReadIssue[];
  message: string;
};

export type ArcProfileApiSuccess = {
  ok: true;
  activeLaunchCount: number;
  graduatedLaunchCount: number;
  graduationPendingLaunchCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  launches: ArcProfileLaunch[];
  limit: number;
  page: number;
  sort: ArcProfileSort;
  totalCreatedLaunches: number;
  totalPages: number;
  usdcBalance?: string;
  walletAddress: Address;
  warnings: ArcTokenReadIssue[];
};

export type ArcProfileApiResponse = ArcProfileApiError | ArcProfileApiSuccess;

export function buildArcProfileApiPath(
  address: string,
  {
    limit,
    page,
    sort
  }: {
    limit?: number;
    page?: number;
    sort?: ArcProfileSort;
  } = {}
) {
  const path = `/api/arc/profile/${encodeURIComponent(address)}`;
  const params = new URLSearchParams();

  if (typeof page === "number") {
    params.set("page", String(page));
  }

  if (typeof limit === "number") {
    params.set("limit", String(limit));
  }

  if (sort) {
    params.set("sort", sort);
  }

  const query = params.toString();

  return query ? `${path}?${query}` : path;
}

export function isArcProfileApiError(value: unknown): value is ArcProfileApiError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcProfileApiError>;

  return candidate.ok === false && typeof candidate.code === "string";
}

export function isArcProfileApiSuccess(value: unknown): value is ArcProfileApiSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcProfileApiSuccess>;

  return candidate.ok === true && typeof candidate.walletAddress === "string";
}
