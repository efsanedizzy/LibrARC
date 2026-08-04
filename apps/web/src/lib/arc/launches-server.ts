import { getAddress, zeroAddress, type Address, type Hex, type PublicClient } from "viem";

import { launchFactoryAbi, launchPoolAbi, librarcTokenAbi } from "./abis";
import { ARC_FACTORY_DEPLOYMENT_BLOCK, arcDeployment } from "./config";
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
  ARC_LAUNCH_TIME_FILTERS,
  type ArcLaunchListItem,
  type ArcLaunchMetricKind,
  type ArcLaunchSort,
  type ArcLaunchStatusFilter,
  type ArcLaunchTimeFilter
} from "./launches-api";
import { type ArcTokenReadIssue } from "./token-api";

export const DEFAULT_LAUNCHES_PAGE_SIZE = 12;
export const MAX_LAUNCHES_PAGE_SIZE = 24;
export const MAX_FILTER_SCAN_WINDOW = 120;
export const MAX_SEARCH_LENGTH = 120;
export const MAX_METADATA_EVENT_URI_BYTES = 4096;
export const MAX_DISCOVER_LAUNCHES_PROCESSED = 80;
export const MAX_DISCOVER_LOG_BLOCK_RANGE = 10_000n;
export const DISCOVER_LOG_BLOCK_CHUNK_SIZE = MAX_DISCOVER_LOG_BLOCK_RANGE - 1n;
export const POPULAR_SECTION_LIMIT = 10;
export const DISCOVER_CARD_ACTIVITY_LIMIT = 10;

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

type ReadClient = Pick<PublicClient, "getBlock" | "getBlockNumber" | "getLogs" | "readContract">;

type BuyExecutedLog = {
  address?: Address;
  args?: {
    buyer?: Address;
    fee?: bigint;
    netUsdcIn?: bigint;
    realTokenReserve?: bigint;
    realUsdcReserve?: bigint;
    recipient?: Address;
    tokenAmountOut?: bigint;
    usdcAmountIn?: bigint;
  };
  blockNumber?: bigint | null;
  logIndex?: number | null;
  transactionHash?: Hex | null;
};

type SellExecutedLog = {
  address?: Address;
  args?: {
    fee?: bigint;
    grossUsdcAmountOut?: bigint;
    netUsdcAmountOut?: bigint;
    realTokenReserve?: bigint;
    realUsdcReserve?: bigint;
    recipient?: Address;
    seller?: Address;
    tokenAmountIn?: bigint;
  };
  blockNumber?: bigint | null;
  logIndex?: number | null;
  transactionHash?: Hex | null;
};

type PoolTradeRecord = {
  amount: bigint;
  blockNumber: bigint;
  logIndex: number;
  poolAddress: Address;
  transactionHash: Hex;
  type: "buy" | "sell";
};

type PoolTradeMetricState = {
  buyTrades: PoolTradeRecord[];
  hasMetricWarning: boolean;
  sellTrades: PoolTradeRecord[];
};

type LaunchCreatedMetadataLog = {
  args?: {
    metadataUri?: string;
  };
};

const launchCreatedEvent = launchFactoryAbi.find(
  (entry) => entry.type === "event" && entry.name === "LaunchCreated"
);

if (!launchCreatedEvent || launchCreatedEvent.type !== "event") {
  throw new Error("LaunchCreated event is missing from the LaunchFactory ABI.");
}

const buyExecutedEvent = {
  type: "event",
  name: "BuyExecuted",
  anonymous: false,
  inputs: [
    { indexed: true, name: "buyer", type: "address" },
    { indexed: true, name: "recipient", type: "address" },
    { indexed: false, name: "usdcAmountIn", type: "uint256" },
    { indexed: false, name: "fee", type: "uint256" },
    { indexed: false, name: "netUsdcIn", type: "uint256" },
    { indexed: false, name: "tokenAmountOut", type: "uint256" },
    { indexed: false, name: "realUsdcReserve", type: "uint256" },
    { indexed: false, name: "realTokenReserve", type: "uint256" }
  ]
} as const;

const sellExecutedEvent = {
  type: "event",
  name: "SellExecuted",
  anonymous: false,
  inputs: [
    { indexed: true, name: "seller", type: "address" },
    { indexed: true, name: "recipient", type: "address" },
    { indexed: false, name: "tokenAmountIn", type: "uint256" },
    { indexed: false, name: "grossUsdcAmountOut", type: "uint256" },
    { indexed: false, name: "fee", type: "uint256" },
    { indexed: false, name: "netUsdcAmountOut", type: "uint256" },
    { indexed: false, name: "realUsdcReserve", type: "uint256" },
    { indexed: false, name: "realTokenReserve", type: "uint256" }
  ]
} as const;

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
    throw invalidLaunchesRequest(
      "sort",
      "sort must be one of recentBuys, newest, oldest, marketCap, or volume."
    );
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

export function parseLaunchesTimeFilterParam(value: string | null): ArcLaunchTimeFilter {
  if (!value) {
    return "all";
  }

  if (!ARC_LAUNCH_TIME_FILTERS.includes(value as ArcLaunchTimeFilter)) {
    throw invalidLaunchesRequest("timeFilter", "timeFilter must be one of all, 24h, or 7d.");
  }

  return value as ArcLaunchTimeFilter;
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
  sort: "newest" | "oldest";
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

export function getDiscoverLogChunkToBlock({
  chunkStart,
  latestBlock
}: {
  chunkStart: bigint;
  latestBlock: bigint;
}) {
  const candidateToBlock = chunkStart + DISCOVER_LOG_BLOCK_CHUNK_SIZE;

  return candidateToBlock > latestBlock ? latestBlock : candidateToBlock;
}

export function calculateLaunchMarketCap({
  realTokenReserve,
  realUsdcReserve,
  totalSupply,
  virtualTokenReserve,
  virtualUsdcReserve
}: {
  realTokenReserve?: bigint;
  realUsdcReserve?: bigint;
  totalSupply?: bigint;
  virtualTokenReserve?: bigint;
  virtualUsdcReserve?: bigint;
}) {
  if (
    totalSupply === undefined ||
    realUsdcReserve === undefined ||
    realTokenReserve === undefined ||
    virtualUsdcReserve === undefined ||
    virtualTokenReserve === undefined
  ) {
    return undefined;
  }

  const effectiveUsdcReserve = realUsdcReserve + virtualUsdcReserve;
  const effectiveTokenReserve = realTokenReserve + virtualTokenReserve;

  if (effectiveTokenReserve === 0n) {
    return undefined;
  }

  return (totalSupply * effectiveUsdcReserve) / effectiveTokenReserve;
}

function toLaunchRecord(launchId: bigint, record: LaunchRecordGetter): LaunchRecord {
  return {
    creator: record.creator,
    launchId,
    metadataHash: record.metadataHash,
    poolAddress: record.pool,
    tokenAddress: record.token
  };
}

async function readLaunchRecord(client: Pick<PublicClient, "readContract">, launchId: bigint) {
  const record = await readWithRetry(`Factory launchById(${launchId})`, () =>
    client.readContract({
      address: arcDeployment.factoryAddress,
      abi: launchFactoryAbi,
      args: [launchId],
      functionName: "launchById"
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
  const logs = (await client.getLogs({
    address: arcDeployment.factoryAddress,
    args: {
      launchId
    },
    event: launchCreatedEvent,
    fromBlock: ARC_FACTORY_DEPLOYMENT_BLOCK,
    toBlock: "latest"
  })) as LaunchCreatedMetadataLog[];

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

  if (!log.args?.metadataUri) {
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
    creator: record.creator,
    creatorExplorerUrl,
    hasCanonicalError: false,
    launchId: toBigIntString(record.launchId),
    poolAddress: record.poolAddress,
    poolExplorerUrl,
    tokenAddress: record.tokenAddress,
    tokenExplorerUrl,
    tokenPageUrl,
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
        args: [record.tokenAddress],
        functionName: "isLibrarcToken"
      })
    ),
    optionalRead("Factory isLibrarcPool()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: launchFactoryAbi,
        args: [record.poolAddress],
        functionName: "isLibrarcPool"
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
  const marketCap = calculateLaunchMarketCap({
    realTokenReserve: curveStateResult.value?.realTokenReserve,
    realUsdcReserve,
    totalSupply: totalSupplyResult.value,
    virtualTokenReserve: curveStateResult.value?.virtualTokenReserve,
    virtualUsdcReserve: curveStateResult.value?.virtualUsdcReserve
  });

  const item: ArcLaunchListItem = {
    ...baseItem,
    accruedProtocolFees:
      curveStateResult.value?.accruedProtocolFees === undefined
        ? undefined
        : toBigIntString(curveStateResult.value.accruedProtocolFees),
    canBuy: canBuyResult.value,
    canSell: canSellResult.value,
    decimals: decimalsResult.value === undefined ? undefined : Number(decimalsResult.value),
    description: metadataResult.value?.description,
    graduationProgress,
    hasCanonicalError:
      isRegisteredTokenResult.value === false || isRegisteredPoolResult.value === false,
    isRegisteredPool: isRegisteredPoolResult.value,
    isRegisteredToken: isRegisteredTokenResult.value,
    marketCap: marketCap === undefined ? undefined : toBigIntString(marketCap),
    metricWarningCount: 0,
    name: nameResult.value,
    poolStatus,
    poolStatusLabel: poolStatus === undefined ? undefined : getPoolStatusLabel(poolStatus),
    realTokenReserve:
      curveStateResult.value?.realTokenReserve === undefined
        ? undefined
        : toBigIntString(curveStateResult.value.realTokenReserve),
    realUsdcReserve: realUsdcReserve === undefined ? undefined : toBigIntString(realUsdcReserve),
    remainingGraduationCapacity:
      remainingGraduationCapacity === undefined
        ? undefined
        : toBigIntString(remainingGraduationCapacity),
    symbol: symbolResult.value,
    totalSupply:
      totalSupplyResult.value === undefined ? undefined : toBigIntString(totalSupplyResult.value)
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

function createPoolTradeMetrics() {
  return {
    buyTrades: [] as PoolTradeRecord[],
    hasMetricWarning: false,
    sellTrades: [] as PoolTradeRecord[]
  } as PoolTradeMetricState;
}

function dedupeTradeRecords(records: readonly PoolTradeRecord[]) {
  const seen = new Set<string>();
  const deduped: PoolTradeRecord[] = [];

  for (const record of records) {
    const key = `${record.transactionHash}-${record.logIndex}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(record);
  }

  return deduped;
}

function getTimeFilterCutoff(latestTimestamp: bigint | undefined, timeFilter: ArcLaunchTimeFilter) {
  if (!latestTimestamp || timeFilter === "all") {
    return null;
  }

  if (timeFilter === "24h") {
    return latestTimestamp - 86_400n;
  }

  return latestTimestamp - 604_800n;
}

function sortTradesDescending(left: PoolTradeRecord, right: PoolTradeRecord) {
  if (left.blockNumber !== right.blockNumber) {
    return left.blockNumber > right.blockNumber ? -1 : 1;
  }

  return right.logIndex - left.logIndex;
}

async function readPoolTradeMetrics({
  client,
  includeEventMetrics,
  poolAddresses,
  timeFilter
}: {
  client: ReadClient;
  includeEventMetrics: boolean;
  poolAddresses: Address[];
  timeFilter: ArcLaunchTimeFilter;
}) {
  const metricsByPool = new Map<Address, ReturnType<typeof createPoolTradeMetrics>>(
    poolAddresses.map((poolAddress) => [poolAddress, createPoolTradeMetrics()])
  );
  const warnings: ArcTokenReadIssue[] = [];

  if (!includeEventMetrics || poolAddresses.length === 0) {
    return {
      latestTimestamp: undefined,
      metricsByPool,
      warnings
    };
  }

  const latestBlock = await readWithRetry("Arc latest block", () => client.getBlockNumber());

  if (latestBlock < ARC_FACTORY_DEPLOYMENT_BLOCK) {
    return {
      latestTimestamp: undefined,
      metricsByPool,
      warnings
    };
  }

  const latestBlockResult = await optionalRead(`Block ${latestBlock}`, () =>
    client.getBlock({
      blockNumber: latestBlock
    })
  );

  if (latestBlockResult.warning) {
    warnings.push(latestBlockResult.warning);
  }

  const blockTimestamps = new Map<bigint, bigint>();
  const latestTimestamp =
    latestBlockResult.value && "timestamp" in latestBlockResult.value
      ? BigInt(latestBlockResult.value.timestamp)
      : undefined;

  if (latestTimestamp !== undefined) {
    blockTimestamps.set(latestBlock, latestTimestamp);
  }

  let chunkStart = ARC_FACTORY_DEPLOYMENT_BLOCK;

  while (chunkStart <= latestBlock) {
    const fromBlock = chunkStart;
    const toBlock = getDiscoverLogChunkToBlock({
      chunkStart,
      latestBlock
    });

    const [buyLogsResult, sellLogsResult] = await Promise.all([
      optionalRead(`BuyExecuted ${fromBlock}-${toBlock}`, () =>
        client.getLogs({
          address: poolAddresses,
          event: buyExecutedEvent,
          fromBlock,
          toBlock
        })
      ),
      optionalRead(`SellExecuted ${fromBlock}-${toBlock}`, () =>
        client.getLogs({
          address: poolAddresses,
          event: sellExecutedEvent,
          fromBlock,
          toBlock
        })
      )
    ]);

    if (buyLogsResult.warning) {
      warnings.push(buyLogsResult.warning);
      for (const metrics of metricsByPool.values()) {
        metrics.hasMetricWarning = true;
      }
    }

    if (sellLogsResult.warning) {
      warnings.push(sellLogsResult.warning);
      for (const metrics of metricsByPool.values()) {
        metrics.hasMetricWarning = true;
      }
    }

    for (const log of (buyLogsResult.value ?? []) as unknown as BuyExecutedLog[]) {
      if (
        !log.address ||
        !log.transactionHash ||
        log.logIndex === null ||
        log.logIndex === undefined ||
        log.blockNumber === null ||
        log.blockNumber === undefined ||
        log.args?.usdcAmountIn === undefined
      ) {
        warnings.push({
          label: `BuyExecuted ${fromBlock}-${toBlock}`,
          message: "A buy event log was missing one or more expected fields."
        });
        continue;
      }

      const metrics = metricsByPool.get(log.address);

      if (!metrics) {
        continue;
      }

      metrics.buyTrades.push({
        amount: log.args.usdcAmountIn,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        poolAddress: log.address,
        transactionHash: log.transactionHash,
        type: "buy"
      });
    }

    for (const log of (sellLogsResult.value ?? []) as unknown as SellExecutedLog[]) {
      if (
        !log.address ||
        !log.transactionHash ||
        log.logIndex === null ||
        log.logIndex === undefined ||
        log.blockNumber === null ||
        log.blockNumber === undefined ||
        log.args?.grossUsdcAmountOut === undefined
      ) {
        warnings.push({
          label: `SellExecuted ${fromBlock}-${toBlock}`,
          message: "A sell event log was missing one or more expected fields."
        });
        continue;
      }

      const metrics = metricsByPool.get(log.address);

      if (!metrics) {
        continue;
      }

      metrics.sellTrades.push({
        amount: log.args.grossUsdcAmountOut,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        poolAddress: log.address,
        transactionHash: log.transactionHash,
        type: "sell"
      });
    }

    chunkStart = toBlock + 1n;
  }

  const needsTimestampFilter = timeFilter !== "all";

  if (needsTimestampFilter && latestTimestamp === undefined) {
    for (const metrics of metricsByPool.values()) {
      metrics.hasMetricWarning = true;
    }
  }

  if (needsTimestampFilter) {
    const uniqueBlockNumbers = [
      ...new Set(
        [...metricsByPool.values()]
          .flatMap((metrics) => [...metrics.buyTrades, ...metrics.sellTrades])
          .map((trade) => trade.blockNumber.toString(10))
      )
    ].map((value) => BigInt(value));

    for (const blockNumber of uniqueBlockNumbers) {
      if (blockTimestamps.has(blockNumber)) {
        continue;
      }

      const blockResult = await optionalRead(`Block ${blockNumber}`, () =>
        client.getBlock({
          blockNumber
        })
      );

      if (blockResult.warning) {
        warnings.push(blockResult.warning);
        for (const metrics of metricsByPool.values()) {
          metrics.hasMetricWarning = true;
        }
        continue;
      }

      if (blockResult.value && "timestamp" in blockResult.value) {
        blockTimestamps.set(blockNumber, BigInt(blockResult.value.timestamp));
      }
    }
  }

  const cutoffTimestamp = getTimeFilterCutoff(latestTimestamp, timeFilter);

  for (const metrics of metricsByPool.values()) {
    metrics.buyTrades = dedupeTradeRecords(metrics.buyTrades).sort(sortTradesDescending);
    metrics.sellTrades = dedupeTradeRecords(metrics.sellTrades).sort(sortTradesDescending);

    if (needsTimestampFilter && cutoffTimestamp !== null) {
      metrics.buyTrades = metrics.buyTrades.filter((trade) => {
        const timestamp = blockTimestamps.get(trade.blockNumber);

        if (timestamp === undefined) {
          metrics.hasMetricWarning = true;
          return false;
        }

        return timestamp >= cutoffTimestamp;
      });
      metrics.sellTrades = metrics.sellTrades.filter((trade) => {
        const timestamp = blockTimestamps.get(trade.blockNumber);

        if (timestamp === undefined) {
          metrics.hasMetricWarning = true;
          return false;
        }

        return timestamp >= cutoffTimestamp;
      });
    }
  }

  return {
    latestTimestamp,
    metricsByPool,
    warnings
  };
}

function resolvePopularMetric(items: readonly ArcLaunchListItem[]) {
  const hasMarketCap = items.some((item) => item.marketCap !== undefined);

  if (hasMarketCap) {
    return {
      metricKind: "marketCap" as const,
      metricLabel: "Market cap"
    };
  }

  return {
    metricKind: "realUsdcReserve" as const,
    metricLabel: "Largest real USDC reserves"
  };
}

function compareBigIntString(left: string | undefined, right: string | undefined) {
  if (left === undefined && right === undefined) {
    return 0;
  }

  if (left === undefined) {
    return 1;
  }

  if (right === undefined) {
    return -1;
  }

  const leftValue = BigInt(left);
  const rightValue = BigInt(right);

  if (leftValue === rightValue) {
    return 0;
  }

  return leftValue > rightValue ? -1 : 1;
}

function compareLaunchIdDescending(left: ArcLaunchListItem, right: ArcLaunchListItem) {
  const leftValue = BigInt(left.launchId);
  const rightValue = BigInt(right.launchId);

  if (leftValue === rightValue) {
    return 0;
  }

  return leftValue > rightValue ? -1 : 1;
}

function compareLaunchIdAscending(left: ArcLaunchListItem, right: ArcLaunchListItem) {
  const leftValue = BigInt(left.launchId);
  const rightValue = BigInt(right.launchId);

  if (leftValue === rightValue) {
    return 0;
  }

  return leftValue < rightValue ? -1 : 1;
}

function sortItemsForPopular(items: readonly ArcLaunchListItem[]) {
  const popularMetric = resolvePopularMetric(items);
  const ranked = [...items].sort((left, right) => {
    const primaryComparison =
      popularMetric.metricKind === "marketCap"
        ? compareBigIntString(left.marketCap, right.marketCap)
        : compareBigIntString(left.realUsdcReserve, right.realUsdcReserve);

    if (primaryComparison !== 0) {
      return primaryComparison;
    }

    return compareLaunchIdDescending(left, right);
  });

  return {
    items: ranked.slice(0, POPULAR_SECTION_LIMIT),
    metricKind: popularMetric.metricKind,
    metricLabel: popularMetric.metricLabel
  };
}

function sortItemsForExplore({
  items,
  sort
}: {
  items: readonly ArcLaunchListItem[];
  sort: ArcLaunchSort;
}) {
  const ranked = [...items].sort((left, right) => {
    if (sort === "newest") {
      return compareLaunchIdDescending(left, right);
    }

    if (sort === "oldest") {
      return compareLaunchIdAscending(left, right);
    }

    if (sort === "marketCap") {
      const comparison = compareBigIntString(left.marketCap, right.marketCap);

      if (comparison !== 0) {
        return comparison;
      }

      return compareLaunchIdDescending(left, right);
    }

    if (sort === "volume") {
      const comparison = compareBigIntString(left.volume, right.volume);

      if (comparison !== 0) {
        return comparison;
      }

      return compareLaunchIdDescending(left, right);
    }

    const leftBuyBlock = left.lastBuyBlockNumber ? BigInt(left.lastBuyBlockNumber) : undefined;
    const rightBuyBlock = right.lastBuyBlockNumber ? BigInt(right.lastBuyBlockNumber) : undefined;

    if (leftBuyBlock === undefined && rightBuyBlock === undefined) {
      return compareLaunchIdDescending(left, right);
    }

    if (leftBuyBlock === undefined) {
      return 1;
    }

    if (rightBuyBlock === undefined) {
      return -1;
    }

    if (leftBuyBlock === rightBuyBlock) {
      const leftLogIndex = left.lastBuyLogIndex;
      const rightLogIndex = right.lastBuyLogIndex;

      if (
        leftLogIndex !== undefined &&
        rightLogIndex !== undefined &&
        leftLogIndex !== rightLogIndex
      ) {
        return rightLogIndex - leftLogIndex;
      }

      return compareLaunchIdDescending(left, right);
    }

    return leftBuyBlock > rightBuyBlock ? -1 : 1;
  });

  if (sort === "marketCap") {
    return {
      items: ranked,
      metricKind: "marketCap" as const,
      metricLabel: "Market cap"
    };
  }

  if (sort === "volume") {
    return {
      items: ranked,
      metricKind: "volume" as const,
      metricLabel: "Volume"
    };
  }

  if (sort === "recentBuys") {
    return {
      items: ranked,
      metricKind: "recentBuys" as const,
      metricLabel: "Recent buys"
    };
  }

  return {
    items: ranked,
    metricKind: "launchId" as const,
    metricLabel: sort === "newest" ? "Newest" : "Oldest"
  };
}

function applyPoolTradeMetrics({
  items,
  metricsByPool
}: {
  items: readonly ArcLaunchListItem[];
  metricsByPool: Map<Address, PoolTradeMetricState>;
}) {
  return items.map((item) => {
    const metrics = metricsByPool.get(item.poolAddress);

    if (!metrics) {
      return item;
    }

    const lastBuyTrade = metrics.buyTrades[0];
    const latestTrade = [...metrics.buyTrades, ...metrics.sellTrades].sort(sortTradesDescending)[0];
    const volume = [...metrics.buyTrades, ...metrics.sellTrades].reduce(
      (sum, trade) => sum + trade.amount,
      0n
    );
    const hasReliableEventMetrics = !metrics.hasMetricWarning;

    return {
      ...item,
      lastBuyBlockNumber:
        hasReliableEventMetrics && lastBuyTrade ? lastBuyTrade.blockNumber.toString(10) : undefined,
      lastBuyLogIndex: hasReliableEventMetrics ? lastBuyTrade?.logIndex : undefined,
      lastTradeBlockNumber:
        hasReliableEventMetrics && latestTrade ? latestTrade.blockNumber.toString(10) : undefined,
      metricWarningCount: (item.metricWarningCount ?? 0) + (metrics.hasMetricWarning ? 1 : 0),
      volume: hasReliableEventMetrics ? toBigIntString(volume) : undefined
    } satisfies ArcLaunchListItem;
  });
}

function describeMetricScanWarning({
  includeEventMetrics,
  sort,
  timeFilter
}: {
  includeEventMetrics: boolean;
  sort: ArcLaunchSort;
  timeFilter: ArcLaunchTimeFilter;
}) {
  if (!includeEventMetrics) {
    return undefined;
  }

  if (sort === "recentBuys") {
    return {
      label: "Recent buys",
      message:
        timeFilter === "all"
          ? "Recent-buy ordering is derived from canonical BuyExecuted logs in bounded block chunks."
          : `Recent-buy ordering is derived from canonical BuyExecuted logs within the selected ${timeFilter} window.`
    } satisfies ArcTokenReadIssue;
  }

  if (sort === "volume") {
    return {
      label: "Volume",
      message:
        timeFilter === "all"
          ? "Volume uses BuyExecuted.usdcAmountIn plus SellExecuted.grossUsdcAmountOut across bounded canonical pool log queries."
          : `Volume uses BuyExecuted.usdcAmountIn plus SellExecuted.grossUsdcAmountOut within the selected ${timeFilter} window.`
    } satisfies ArcTokenReadIssue;
  }

  return undefined;
}

export async function readFactoryLaunchesPage(
  {
    limit,
    page,
    search,
    sort,
    status,
    timeFilter
  }: {
    limit: number;
    page: number;
    search: string;
    sort: ArcLaunchSort;
    status: ArcLaunchStatusFilter;
    timeFilter: ArcLaunchTimeFilter;
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
      effectiveSortMetricKind: "launchId" as ArcLaunchMetricKind,
      effectiveSortMetricLabel: sort === "oldest" ? "Oldest" : "Newest",
      hasNextPage: false,
      hasPreviousPage: false,
      items: [] as ArcLaunchListItem[],
      limit,
      popularItems: [] as ArcLaunchListItem[],
      popularMetricKind: "marketCap" as ArcLaunchMetricKind,
      popularMetricLabel: "Market cap",
      scanWindowApplied: 0,
      totalFilteredLaunches: 0,
      totalLaunchCount,
      totalPages: 0,
      timeFilter,
      warnings: [] as ArcTokenReadIssue[]
    };
  }

  const normalizedSearch = normalizeLaunchSearchTerm(search);
  const requestHasFilters = normalizedSearch.length > 0 || status !== "all";
  const exploreScanWindow = requestHasFilters
    ? Math.min(
        getScanWindowForFilteredRequest({
          launchCount: totalLaunchCount,
          limit,
          page
        }),
        MAX_DISCOVER_LAUNCHES_PROCESSED
      )
    : Math.min(totalLaunchCount, MAX_DISCOVER_LAUNCHES_PROCESSED);
  const popularScanWindow = Math.min(totalLaunchCount, MAX_DISCOVER_LAUNCHES_PROCESSED);
  const exploreBaseSort = sort === "oldest" ? "oldest" : "newest";
  const popularIds = getLaunchIdsForPage({
    launchCount: totalLaunchCount,
    limit: popularScanWindow,
    page: 1,
    sort: "newest"
  });
  const exploreIds = getLaunchIdsForPage({
    launchCount: totalLaunchCount,
    limit: exploreScanWindow,
    page: 1,
    sort: exploreBaseSort
  });
  const candidateIds = [
    ...new Set([...popularIds, ...exploreIds].map((launchId) => launchId.toString(10)))
  ].map((value) => BigInt(value));
  const scanWindowApplied = candidateIds.length;

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
            creator: placeholderAddress,
            creatorExplorerUrl: buildArcScanAddressUrl(
              arcDeployment.explorerUrl,
              placeholderAddress
            ),
            hasCanonicalError: true,
            launchId: launchId.toString(10),
            poolAddress: placeholderAddress,
            poolExplorerUrl: buildArcScanAddressUrl(arcDeployment.explorerUrl, placeholderAddress),
            tokenAddress: placeholderAddress,
            tokenExplorerUrl: buildArcScanAddressUrl(arcDeployment.explorerUrl, placeholderAddress),
            tokenPageUrl: buildLaunchTokenPagePath(placeholderAddress),
            warnings: [issue]
          } satisfies ArcLaunchListItem,
          matchesFilter: normalizedSearch.length === 0 && status === "all"
        };
      })
    )
  );

  const canonicalItems = resolved.map((record) => record.item);
  const metricEligibleItems = canonicalItems.filter((item) => !item.hasCanonicalError);
  const includeEventMetrics = sort === "recentBuys" || sort === "volume";
  const poolTradeMetrics = await readPoolTradeMetrics({
    client,
    includeEventMetrics,
    poolAddresses: metricEligibleItems.map((item) => item.poolAddress),
    timeFilter
  });
  const decoratedItems = applyPoolTradeMetrics({
    items: canonicalItems,
    metricsByPool: poolTradeMetrics.metricsByPool
  });
  const decoratedResolved = resolved.map((record) => ({
    ...record,
    item: decoratedItems.find((item) => item.launchId === record.item.launchId) ?? record.item
  }));
  const filtered = requestHasFilters
    ? decoratedResolved.filter((record) => record.matchesFilter)
    : decoratedResolved;
  const exploreRanking = sortItemsForExplore({
    items: filtered.map((record) => record.item),
    sort
  });
  const paginatedItems = exploreRanking.items.slice((page - 1) * limit, page * limit);
  const totalFilteredLaunches = filtered.length;
  const totalPages = totalFilteredLaunches === 0 ? 0 : ceilDiv(totalFilteredLaunches, limit);
  const hasPreviousPage = page > 1 && totalPages > 0;
  const hasNextPage = page < totalPages;
  const popularRanking = sortItemsForPopular(metricEligibleItems);
  const warnings: ArcTokenReadIssue[] = [...poolTradeMetrics.warnings];

  if (requestHasFilters && scanWindowApplied < totalLaunchCount) {
    warnings.push({
      label: "Launch search",
      message: `Filtered Discover requests scan up to ${scanWindowApplied} launches per request to keep reads bounded.`
    });
  } else if (!requestHasFilters && scanWindowApplied < totalLaunchCount) {
    warnings.push({
      label: "Discover scan window",
      message: `Discover rankings currently process up to ${scanWindowApplied} canonical launches per request to keep event reads bounded.`
    });
  }

  const metricWarning = describeMetricScanWarning({
    includeEventMetrics,
    sort,
    timeFilter
  });

  if (metricWarning) {
    warnings.push(metricWarning);
  }

  return {
    currentPage: page,
    effectiveSortMetricKind: exploreRanking.metricKind,
    effectiveSortMetricLabel: exploreRanking.metricLabel,
    hasNextPage,
    hasPreviousPage,
    items: paginatedItems,
    limit,
    popularItems: popularRanking.items,
    popularMetricKind: popularRanking.metricKind,
    popularMetricLabel: popularRanking.metricLabel,
    scanWindowApplied,
    timeFilter,
    totalFilteredLaunches,
    totalLaunchCount,
    totalPages,
    warnings
  };
}
