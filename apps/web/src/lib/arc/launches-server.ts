import { getAddress, zeroAddress, type Address, type Hex, type PublicClient } from "viem";

import { launchFactoryAbi, launchPoolAbi, librarcTokenAbi } from "./abis";
import { arcDeployment } from "./config";
import {
  buildArcScanAddressUrl,
  buildLaunchTokenPagePath,
  parseLaunchMetadataUri
} from "./launch-metadata";
import { getGraduationPercentage, getPoolStatusLabel } from "./format";
import { getArcTestnetServerPublicClient } from "./server-client";
import {
  optionalRead,
  readWithRetry,
  toBigIntString,
  toReadIssue,
  toRouteFailure
} from "./server-routes";
import {
  ARC_LAUNCH_SORT_OPTIONS,
  ARC_LAUNCH_STATUS_FILTERS,
  type ArcLaunchListItem,
  type ArcLaunchSort,
  type ArcLaunchStatusFilter
} from "./launches-api";
import { type ArcTokenReadIssue } from "./token-api";

export const DEFAULT_LAUNCHES_PAGE_SIZE = 12;
export const MAX_LAUNCHES_PAGE_SIZE = 24;
export const MAX_FILTER_SCAN_WINDOW = 120;
export const MAX_SEARCH_LENGTH = 120;
export const MAX_METADATA_EVENT_URI_BYTES = 4096;

type LaunchRecordGetter = {
  creator: Address;
  metadataHash: Hex;
  pool: Address;
  token: Address;
};

type LaunchRecord = {
  creator: Address;
  launchId: bigint;
  metadataHash: Hex;
  poolAddress: Address;
  tokenAddress: Address;
};

type LaunchDisplayRecord = {
  item: ArcLaunchListItem;
  matchesFilter: boolean;
};

type ReadClient = Pick<PublicClient, "getLogs" | "readContract">;

export function ceilDiv(numerator: number, denominator: number) {
  return Math.ceil(numerator / denominator);
}

export function normalizeLaunchSearchTerm(search: string) {
  return search.trim().toLowerCase();
}

export function parseLaunchesPageParam(value: string | null) {
  if (!value) {
    return 1;
  }

  if (!/^\d+$/.test(value)) {
    throw invalidLaunchesRequest("page", "page must be a positive integer.");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw invalidLaunchesRequest("page", "page must be a positive integer.");
  }

  return parsed;
}

export function parseLaunchesLimitParam(value: string | null) {
  if (!value) {
    return DEFAULT_LAUNCHES_PAGE_SIZE;
  }

  if (!/^\d+$/.test(value)) {
    throw invalidLaunchesRequest("limit", "limit must be a positive integer.");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw invalidLaunchesRequest("limit", "limit must be a positive integer.");
  }

  if (parsed > MAX_LAUNCHES_PAGE_SIZE) {
    throw invalidLaunchesRequest("limit", `limit cannot exceed ${MAX_LAUNCHES_PAGE_SIZE}.`);
  }

  return parsed;
}

export function parseLaunchesSortParam(value: string | null): ArcLaunchSort {
  if (!value) {
    return "newest";
  }

  if (!ARC_LAUNCH_SORT_OPTIONS.includes(value as ArcLaunchSort)) {
    throw invalidLaunchesRequest("sort", "sort must be either newest or oldest.");
  }

  return value as ArcLaunchSort;
}

export function parseLaunchesStatusParam(value: string | null): ArcLaunchStatusFilter {
  if (!value) {
    return "all";
  }

  if (!ARC_LAUNCH_STATUS_FILTERS.includes(value as ArcLaunchStatusFilter)) {
    throw invalidLaunchesRequest(
      "status",
      "status must be one of all, active, graduation-pending, graduated, or paused."
    );
  }

  return value as ArcLaunchStatusFilter;
}

export function parseLaunchesSearchParam(value: string | null) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return "";
  }

  if (normalized.length > MAX_SEARCH_LENGTH) {
    throw invalidLaunchesRequest("search", `search cannot exceed ${MAX_SEARCH_LENGTH} characters.`);
  }

  return normalized;
}

function invalidLaunchesRequest(label: string, message: string) {
  return toRouteFailure({
    code: "INVALID_REQUEST",
    details: [{ label, message }],
    message,
    status: 400
  });
}

export function getPoolFilterLabel({
  canBuy,
  canSell,
  poolStatus
}: {
  canBuy?: boolean;
  canSell?: boolean;
  poolStatus?: number;
}) {
  if (poolStatus === 1 && (canBuy === false || canSell === false)) {
    return "paused";
  }

  if (poolStatus === 1) {
    return "active";
  }

  if (poolStatus === 2) {
    return "graduation-pending";
  }

  if (poolStatus === 3) {
    return "graduated";
  }

  return "all";
}

export function getLaunchIdsForPage({
  launchCount,
  limit,
  page,
  sort
}: {
  launchCount: number;
  limit: number;
  page: number;
  sort: ArcLaunchSort;
}) {
  if (launchCount === 0) {
    return [] as bigint[];
  }

  const offset = (page - 1) * limit;

  if (offset >= launchCount) {
    return [] as bigint[];
  }

  const ids: bigint[] = [];

  for (let index = 0; index < limit; index += 1) {
    const launchId =
      sort === "newest" ? BigInt(launchCount - offset - index) : BigInt(offset + index + 1);

    if (launchId < 1n || launchId > BigInt(launchCount)) {
      break;
    }

    ids.push(launchId);
  }

  return ids;
}

function getScanWindowForFilteredRequest({
  launchCount,
  limit,
  page
}: {
  launchCount: number;
  limit: number;
  page: number;
}) {
  return Math.min(
    launchCount,
    Math.max(
      limit * page * 2,
      DEFAULT_LAUNCHES_PAGE_SIZE * 4,
      Math.min(MAX_FILTER_SCAN_WINDOW, launchCount)
    )
  );
}

export function matchesLaunchSearch(item: ArcLaunchListItem, normalizedSearch: string) {
  if (!normalizedSearch) {
    return true;
  }

  const addressSearch = normalizedSearch.startsWith("0x") ? normalizedSearch : null;

  const haystacks = [
    item.name?.toLowerCase() ?? "",
    item.symbol?.toLowerCase() ?? "",
    item.tokenAddress.toLowerCase(),
    item.creator.toLowerCase(),
    item.poolAddress.toLowerCase()
  ];

  if (addressSearch) {
    return [item.tokenAddress, item.creator, item.poolAddress].some(
      (value) => value.toLowerCase() === addressSearch
    );
  }

  return haystacks.some((value) => value.includes(normalizedSearch));
}

export function matchesLaunchStatusFilter(item: ArcLaunchListItem, status: ArcLaunchStatusFilter) {
  if (status === "all") {
    return true;
  }

  return (
    getPoolFilterLabel({
      poolStatus: item.poolStatus,
      canBuy: item.canBuy,
      canSell: item.canSell
    }) === status
  );
}

function toLaunchRecord(launchId: bigint, record: LaunchRecordGetter): LaunchRecord {
  return {
    launchId,
    creator: record.creator,
    tokenAddress: record.token,
    poolAddress: record.pool,
    metadataHash: record.metadataHash
  };
}

async function readLaunchRecord(client: Pick<PublicClient, "readContract">, launchId: bigint) {
  const record = await readWithRetry(`Factory launchById(${launchId})`, () =>
    client.readContract({
      address: arcDeployment.factoryAddress,
      abi: launchFactoryAbi,
      functionName: "launchById",
      args: [launchId]
    })
  );

  return toLaunchRecord(launchId, record as LaunchRecordGetter);
}

async function readLaunchMetadataDescription({
  client,
  launchId
}: {
  client: Pick<PublicClient, "getLogs">;
  launchId: bigint;
}) {
  const logs = await client.getLogs({
    address: arcDeployment.factoryAddress,
    event: launchFactoryAbi.find(
      (entry) => entry.type === "event" && entry.name === "LaunchCreated"
    )!,
    args: {
      launchId
    },
    fromBlock: 0n,
    toBlock: "latest"
  });

  const log = logs[logs.length - 1];

  if (!log) {
    return {
      description: undefined,
      warning: {
        label: `LaunchCreated(${launchId})`,
        message: "No LaunchCreated log was found for this launch."
      } satisfies ArcTokenReadIssue
    };
  }

  if (!log.args.metadataUri) {
    return {
      description: undefined,
      warning: {
        label: `LaunchCreated(${launchId})`,
        message: "The LaunchCreated log did not include a metadata URI."
      }
    };
  }

  const parsed = parseLaunchMetadataUri(log.args.metadataUri, {
    maxBytes: MAX_METADATA_EVENT_URI_BYTES
  });

  return {
    description: parsed.description,
    warning: parsed.warning
  };
}

async function resolveLaunchDisplayRecord({
  client,
  launchId,
  normalizedSearch,
  status
}: {
  client: ReadClient;
  launchId: bigint;
  normalizedSearch: string;
  status: ArcLaunchStatusFilter;
}): Promise<LaunchDisplayRecord> {
  const warnings: ArcTokenReadIssue[] = [];
  const record = await readLaunchRecord(client, launchId);
  const tokenPageUrl = buildLaunchTokenPagePath(record.tokenAddress);
  const tokenExplorerUrl = buildArcScanAddressUrl(arcDeployment.explorerUrl, record.tokenAddress);
  const poolExplorerUrl = buildArcScanAddressUrl(arcDeployment.explorerUrl, record.poolAddress);
  const creatorExplorerUrl = buildArcScanAddressUrl(arcDeployment.explorerUrl, record.creator);

  const baseItem: ArcLaunchListItem = {
    launchId: toBigIntString(record.launchId),
    creator: record.creator,
    tokenAddress: record.tokenAddress,
    poolAddress: record.poolAddress,
    tokenPageUrl,
    tokenExplorerUrl,
    poolExplorerUrl,
    creatorExplorerUrl,
    hasCanonicalError: false,
    warnings
  };

  if (
    record.creator === zeroAddress ||
    record.tokenAddress === zeroAddress ||
    record.poolAddress === zeroAddress
  ) {
    warnings.push({
      label: `Factory launchById(${launchId})`,
      message: "The factory returned a launch record with one or more zero addresses."
    });

    return {
      item: {
        ...baseItem,
        hasCanonicalError: true
      },
      matchesFilter: matchesLaunchSearch(baseItem, normalizedSearch)
    };
  }

  const [
    isRegisteredTokenResult,
    isRegisteredPoolResult,
    nameResult,
    symbolResult,
    decimalsResult,
    totalSupplyResult,
    poolStatusResult,
    canBuyResult,
    canSellResult,
    curveStateResult,
    remainingGraduationCapacityResult,
    metadataResult
  ] = await Promise.all([
    optionalRead("Factory isLibrarcToken()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "isLibrarcToken",
        args: [record.tokenAddress]
      })
    ),
    optionalRead("Factory isLibrarcPool()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        functionName: "isLibrarcPool",
        args: [record.poolAddress]
      })
    ),
    optionalRead("Token name()", () =>
      client.readContract({
        address: record.tokenAddress,
        abi: librarcTokenAbi,
        functionName: "name"
      })
    ),
    optionalRead("Token symbol()", () =>
      client.readContract({
        address: record.tokenAddress,
        abi: librarcTokenAbi,
        functionName: "symbol"
      })
    ),
    optionalRead("Token decimals()", () =>
      client.readContract({
        address: record.tokenAddress,
        abi: librarcTokenAbi,
        functionName: "decimals"
      })
    ),
    optionalRead("Token totalSupply()", () =>
      client.readContract({
        address: record.tokenAddress,
        abi: librarcTokenAbi,
        functionName: "totalSupply"
      })
    ),
    optionalRead("Pool status()", () =>
      client.readContract({
        address: record.poolAddress,
        abi: launchPoolAbi,
        functionName: "status"
      })
    ),
    optionalRead("Pool canBuy()", () =>
      client.readContract({
        address: record.poolAddress,
        abi: launchPoolAbi,
        functionName: "canBuy"
      })
    ),
    optionalRead("Pool canSell()", () =>
      client.readContract({
        address: record.poolAddress,
        abi: launchPoolAbi,
        functionName: "canSell"
      })
    ),
    optionalRead("Pool curveState()", () =>
      client.readContract({
        address: record.poolAddress,
        abi: launchPoolAbi,
        functionName: "curveState"
      })
    ),
    optionalRead("Pool remainingGraduationCapacity()", () =>
      client.readContract({
        address: record.poolAddress,
        abi: launchPoolAbi,
        functionName: "remainingGraduationCapacity"
      })
    ),
    optionalRead(`LaunchCreated(${launchId})`, () =>
      readLaunchMetadataDescription({
        client,
        launchId
      })
    )
  ]);

  for (const result of [
    isRegisteredTokenResult,
    isRegisteredPoolResult,
    nameResult,
    symbolResult,
    decimalsResult,
    totalSupplyResult,
    poolStatusResult,
    canBuyResult,
    canSellResult,
    curveStateResult,
    remainingGraduationCapacityResult,
    metadataResult
  ]) {
    if (result.warning) {
      warnings.push(result.warning);
    }
  }

  const poolStatus =
    poolStatusResult.value === undefined ? undefined : Number(poolStatusResult.value);
  const realUsdcReserve = curveStateResult.value?.realUsdcReserve;
  const remainingGraduationCapacity = remainingGraduationCapacityResult.value;
  const graduationProgress =
    realUsdcReserve !== undefined && remainingGraduationCapacity !== undefined
      ? getGraduationPercentage(realUsdcReserve, remainingGraduationCapacity)
      : undefined;

  const item: ArcLaunchListItem = {
    ...baseItem,
    isRegisteredToken: isRegisteredTokenResult.value,
    isRegisteredPool: isRegisteredPoolResult.value,
    hasCanonicalError:
      isRegisteredTokenResult.value === false || isRegisteredPoolResult.value === false,
    name: nameResult.value,
    symbol: symbolResult.value,
    decimals: decimalsResult.value === undefined ? undefined : Number(decimalsResult.value),
    totalSupply:
      totalSupplyResult.value === undefined ? undefined : toBigIntString(totalSupplyResult.value),
    poolStatus,
    poolStatusLabel: poolStatus === undefined ? undefined : getPoolStatusLabel(poolStatus),
    canBuy: canBuyResult.value,
    canSell: canSellResult.value,
    realUsdcReserve: realUsdcReserve === undefined ? undefined : toBigIntString(realUsdcReserve),
    realTokenReserve:
      curveStateResult.value?.realTokenReserve === undefined
        ? undefined
        : toBigIntString(curveStateResult.value.realTokenReserve),
    accruedProtocolFees:
      curveStateResult.value?.accruedProtocolFees === undefined
        ? undefined
        : toBigIntString(curveStateResult.value.accruedProtocolFees),
    remainingGraduationCapacity:
      remainingGraduationCapacity === undefined
        ? undefined
        : toBigIntString(remainingGraduationCapacity),
    graduationProgress,
    description: metadataResult.value?.description
  };

  if (item.hasCanonicalError) {
    warnings.push({
      label: `Launch ${launchId}`,
      message: "The canonical factory registry checks failed for this launch."
    });
  }

  return {
    item,
    matchesFilter:
      matchesLaunchSearch(item, normalizedSearch) && matchesLaunchStatusFilter(item, status)
  };
}

export async function readFactoryLaunchesPage(
  {
    limit,
    page,
    search,
    sort,
    status
  }: {
    limit: number;
    page: number;
    search: string;
    sort: ArcLaunchSort;
    status: ArcLaunchStatusFilter;
  },
  client: ReadClient = getArcTestnetServerPublicClient()
) {
  const launchCountBigInt = await readWithRetry("Factory launchCount()", () =>
    client.readContract({
      address: arcDeployment.factoryAddress,
      abi: launchFactoryAbi,
      functionName: "launchCount"
    })
  );
  const totalLaunchCount = Number(launchCountBigInt);

  if (totalLaunchCount === 0) {
    return {
      currentPage: page,
      hasNextPage: false,
      hasPreviousPage: false,
      items: [] as ArcLaunchListItem[],
      limit,
      scanWindowApplied: 0,
      totalFilteredLaunches: 0,
      totalLaunchCount,
      totalPages: 0,
      warnings: [] as ArcTokenReadIssue[]
    };
  }

  const normalizedSearch = normalizeLaunchSearchTerm(search);
  const requestHasFilters = normalizedSearch.length > 0 || status !== "all";
  const scanWindowApplied = requestHasFilters
    ? getScanWindowForFilteredRequest({
        launchCount: totalLaunchCount,
        limit,
        page
      })
    : Math.min(totalLaunchCount, limit);
  const candidateIds = requestHasFilters
    ? getLaunchIdsForPage({
        launchCount: scanWindowApplied,
        limit: scanWindowApplied,
        page: 1,
        sort
      })
    : getLaunchIdsForPage({
        launchCount: totalLaunchCount,
        limit,
        page,
        sort
      });

  const resolved = await Promise.all(
    candidateIds.map((launchId) =>
      resolveLaunchDisplayRecord({
        client,
        launchId,
        normalizedSearch,
        status
      }).catch((error: unknown) => {
        const issue = toReadIssue(`Launch ${launchId}`, error);
        const placeholderAddress = getAddress("0x0000000000000000000000000000000000000001");

        return {
          item: {
            launchId: launchId.toString(10),
            creator: placeholderAddress,
            tokenAddress: placeholderAddress,
            poolAddress: placeholderAddress,
            tokenPageUrl: buildLaunchTokenPagePath(placeholderAddress),
            tokenExplorerUrl: buildArcScanAddressUrl(arcDeployment.explorerUrl, placeholderAddress),
            poolExplorerUrl: buildArcScanAddressUrl(arcDeployment.explorerUrl, placeholderAddress),
            creatorExplorerUrl: buildArcScanAddressUrl(
              arcDeployment.explorerUrl,
              placeholderAddress
            ),
            hasCanonicalError: true,
            warnings: [issue]
          } satisfies ArcLaunchListItem,
          matchesFilter: normalizedSearch.length === 0 && status === "all"
        };
      })
    )
  );

  const filtered = requestHasFilters ? resolved.filter((record) => record.matchesFilter) : resolved;
  const paginatedItems = requestHasFilters
    ? filtered.slice((page - 1) * limit, page * limit).map((record) => record.item)
    : filtered.map((record) => record.item);
  const totalFilteredLaunches = requestHasFilters ? filtered.length : totalLaunchCount;
  const totalPages = totalFilteredLaunches === 0 ? 0 : ceilDiv(totalFilteredLaunches, limit);
  const hasPreviousPage = page > 1 && totalPages > 0;
  const hasNextPage = page < totalPages;
  const warnings: ArcTokenReadIssue[] = [];

  if (requestHasFilters && scanWindowApplied < totalLaunchCount) {
    warnings.push({
      label: "Launch search",
      message: `Filtered requests scan up to ${scanWindowApplied} launches per request to keep Discover reads bounded.`
    });
  }

  return {
    currentPage: page,
    hasNextPage,
    hasPreviousPage,
    items: paginatedItems,
    limit,
    scanWindowApplied,
    totalFilteredLaunches,
    totalLaunchCount,
    totalPages,
    warnings
  };
}
