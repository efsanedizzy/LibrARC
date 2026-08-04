import { type Address } from "viem";

import { type ArcTokenReadIssue } from "./token-api";

export const ARC_LAUNCHES_API_ERROR_CODES = [
  "INVALID_REQUEST",
  "RPC_UNAVAILABLE",
  "CONTRACT_READ_FAILED"
] as const;

export const ARC_LAUNCH_SORT_OPTIONS = [
  "recentBuys",
  "newest",
  "oldest",
  "marketCap",
  "volume"
] as const;
export const ARC_LAUNCH_STATUS_FILTERS = [
  "all",
  "active",
  "graduation-pending",
  "graduated",
  "paused"
] as const;
export const ARC_LAUNCH_TIME_FILTERS = ["all", "24h", "7d"] as const;

export type ArcLaunchesApiErrorCode = (typeof ARC_LAUNCHES_API_ERROR_CODES)[number];
export type ArcLaunchSort = (typeof ARC_LAUNCH_SORT_OPTIONS)[number];
export type ArcLaunchStatusFilter = (typeof ARC_LAUNCH_STATUS_FILTERS)[number];
export type ArcLaunchTimeFilter = (typeof ARC_LAUNCH_TIME_FILTERS)[number];
export type ArcLaunchMetricKind =
  "launchId" | "marketCap" | "realUsdcReserve" | "recentBuys" | "volume";

export type ArcLaunchesApiError = {
  ok: false;
  code: ArcLaunchesApiErrorCode;
  details: ArcTokenReadIssue[];
  message: string;
};

export type ArcLaunchListItem = {
  accruedProtocolFees?: string;
  canBuy?: boolean;
  canSell?: boolean;
  creator: Address;
  creatorExplorerUrl: string;
  decimals?: number;
  description?: string;
  graduationProgress?: number;
  hasCanonicalError: boolean;
  isRegisteredPool?: boolean;
  isRegisteredToken?: boolean;
  launchId: string;
  lastBuyBlockNumber?: string;
  lastBuyLogIndex?: number;
  lastTradeBlockNumber?: string;
  marketCap?: string;
  metricWarningCount?: number;
  name?: string;
  poolAddress: Address;
  poolExplorerUrl: string;
  poolStatus?: number;
  poolStatusLabel?: string;
  realTokenReserve?: string;
  realUsdcReserve?: string;
  remainingGraduationCapacity?: string;
  symbol?: string;
  tokenAddress: Address;
  tokenExplorerUrl: string;
  tokenPageUrl: string;
  totalSupply?: string;
  volume?: string;
  warnings: ArcTokenReadIssue[];
};

export type ArcLaunchesApiSuccess = {
  ok: true;
  currentPage: number;
  effectiveSortMetricKind: ArcLaunchMetricKind;
  effectiveSortMetricLabel: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  items: ArcLaunchListItem[];
  limit: number;
  popularItems: ArcLaunchListItem[];
  popularMetricKind: ArcLaunchMetricKind;
  popularMetricLabel: string;
  scanWindowApplied: number;
  search: string;
  sort: ArcLaunchSort;
  status: ArcLaunchStatusFilter;
  timeFilter: ArcLaunchTimeFilter;
  totalFilteredLaunches: number;
  totalLaunchCount: number;
  totalPages: number;
  warnings: ArcTokenReadIssue[];
};

export type ArcLaunchesApiResponse = ArcLaunchesApiError | ArcLaunchesApiSuccess;

export function buildArcLaunchesApiPath({
  limit,
  page,
  search,
  sort,
  status,
  timeFilter
}: {
  limit?: number;
  page?: number;
  search?: string;
  sort?: ArcLaunchSort;
  status?: ArcLaunchStatusFilter;
  timeFilter?: ArcLaunchTimeFilter;
} = {}) {
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

  if (status) {
    params.set("status", status);
  }

  if (timeFilter) {
    params.set("timeFilter", timeFilter);
  }

  if (search?.trim()) {
    params.set("search", search.trim());
  }

  const query = params.toString();

  return query ? `/api/arc/launches?${query}` : "/api/arc/launches";
}

export function isArcLaunchesApiError(value: unknown): value is ArcLaunchesApiError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcLaunchesApiError>;

  return candidate.ok === false && typeof candidate.code === "string";
}

export function isArcLaunchesApiSuccess(value: unknown): value is ArcLaunchesApiSuccess {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ArcLaunchesApiSuccess>;

  return candidate.ok === true && Array.isArray(candidate.items);
}
