import { zeroAddress, type Address, type Hex, type PublicClient } from "viem";

import { erc20Abi, launchFactoryAbi, launchPoolAbi, librarcTokenAbi } from "./abis";
import { ARC_FACTORY_DEPLOYMENT_BLOCK, arcDeployment } from "./config";
import { getGraduationPercentage, getPoolStatusLabel } from "./format";
import {
  buildArcScanAddressUrl,
  buildArcScanTransactionUrl,
  buildLaunchTokenPagePath
} from "./launch-metadata";
import {
  ARC_PROFILE_SORT_OPTIONS,
  type ArcProfileLaunch,
  type ArcProfileSort
} from "./profile-api";
import { getArcTestnetServerPublicClient } from "./server-client";
import {
  optionalRead,
  readWithRetry,
  toBigIntString,
  toReadIssue,
  toRouteFailure
} from "./server-routes";
import { type ArcTokenReadIssue } from "./token-api";

export const DEFAULT_PROFILE_PAGE_SIZE = 12;
export const MAX_PROFILE_PAGE_SIZE = 24;
export const MAX_PROFILE_LOG_BLOCK_RANGE = 10_000n;
export const PROFILE_LOG_BLOCK_CHUNK_SIZE = 9_999n;

type ReadClient = Pick<PublicClient, "getBlockNumber" | "getLogs" | "readContract">;

type RawLaunchCreatedLog = {
  args?: {
    creator?: Address;
    launchId?: bigint;
    launchPool?: Address;
    launchToken?: Address;
  };
  blockNumber?: bigint | null;
  logIndex?: number | null;
  transactionHash?: Hex | null;
};

type CreatorLaunchReference = {
  creator: Address;
  launchId: bigint;
  poolAddress: Address;
  tokenAddress: Address;
  transactionHash?: Hex;
};

type CanonicalCreatorLaunch = {
  creator: Address;
  launchId: bigint;
  poolAddress: Address;
  tokenAddress: Address;
  transactionHash?: Hex;
};

type CreatorStatusCounts = {
  activeLaunchCount: number;
  graduatedLaunchCount: number;
  graduationPendingLaunchCount: number;
  warnings: ArcTokenReadIssue[];
};

type ReadProfileLaunchItemResult = {
  item: ArcProfileLaunch;
};

type LaunchRecordGetter = {
  creator: Address;
  metadataHash: Hex;
  pool: Address;
  token: Address;
};

function getLaunchCreatedEventDefinition() {
  const eventDefinition = launchFactoryAbi.find(
    (entry) => entry.type === "event" && entry.name === "LaunchCreated"
  );

  if (!eventDefinition || eventDefinition.type !== "event") {
    throw new Error("LaunchCreated event is missing from the LaunchFactory ABI.");
  }

  return eventDefinition;
}

const launchCreatedEvent = getLaunchCreatedEventDefinition();

function invalidProfileRequest(label: string, message: string) {
  return toRouteFailure({
    code: "INVALID_REQUEST",
    details: [{ label, message }],
    message,
    status: 400
  });
}

export function ceilDiv(numerator: number, denominator: number) {
  return Math.ceil(numerator / denominator);
}

export function parseProfilePageParam(value: string | null) {
  if (!value) {
    return 1;
  }

  if (!/^\d+$/.test(value)) {
    throw invalidProfileRequest("page", "page must be a positive integer.");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw invalidProfileRequest("page", "page must be a positive integer.");
  }

  return parsed;
}

export function parseProfileLimitParam(value: string | null) {
  if (!value) {
    return DEFAULT_PROFILE_PAGE_SIZE;
  }

  if (!/^\d+$/.test(value)) {
    throw invalidProfileRequest("limit", "limit must be a positive integer.");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw invalidProfileRequest("limit", "limit must be a positive integer.");
  }

  if (parsed > MAX_PROFILE_PAGE_SIZE) {
    throw invalidProfileRequest("limit", `limit cannot exceed ${MAX_PROFILE_PAGE_SIZE}.`);
  }

  return parsed;
}

export function parseProfileSortParam(value: string | null): ArcProfileSort {
  if (!value) {
    return "newest";
  }

  if (!ARC_PROFILE_SORT_OPTIONS.includes(value as ArcProfileSort)) {
    throw invalidProfileRequest("sort", "sort must be either newest or oldest.");
  }

  return value as ArcProfileSort;
}

export function sortCreatorLaunchReferences(
  launches: readonly CanonicalCreatorLaunch[],
  sort: ArcProfileSort
) {
  return [...launches].sort((left, right) =>
    sort === "newest"
      ? Number(right.launchId - left.launchId)
      : Number(left.launchId - right.launchId)
  );
}

export function isLaunchCreatedCreatorIndexed() {
  const creatorInput = launchCreatedEvent.inputs.find((input) => input.name === "creator");

  return creatorInput?.indexed === true;
}

export function getNextProfileLogChunkToBlock({
  chunkStart,
  latestBlock
}: {
  chunkStart: bigint;
  latestBlock: bigint;
}) {
  const candidateToBlock = chunkStart + PROFILE_LOG_BLOCK_CHUNK_SIZE;

  return candidateToBlock > latestBlock ? latestBlock : candidateToBlock;
}

export async function readCreatorLaunchLogsInChunks(
  {
    creator
  }: {
    creator: Address;
  },
  client: ReadClient = getArcTestnetServerPublicClient()
) {
  const latestBlock = await readWithRetry("Arc latest block", () => client.getBlockNumber());
  const warnings: ArcTokenReadIssue[] = [];

  if (latestBlock < ARC_FACTORY_DEPLOYMENT_BLOCK) {
    return {
      latestBlock,
      launches: [] as CreatorLaunchReference[],
      scannedChunkCount: 0,
      warnings
    };
  }

  const launchesById = new Map<string, CreatorLaunchReference>();
  let scannedChunkCount = 0;
  let chunkStart = ARC_FACTORY_DEPLOYMENT_BLOCK;

  while (chunkStart <= latestBlock) {
    const fromBlock = chunkStart;
    const toBlock = getNextProfileLogChunkToBlock({
      chunkStart,
      latestBlock
    });

    const logs = (await readWithRetry(`Factory LaunchCreated logs ${fromBlock}-${toBlock}`, () =>
      client.getLogs({
        address: arcDeployment.factoryAddress,
        event: launchCreatedEvent,
        args: isLaunchCreatedCreatorIndexed()
          ? {
              creator
            }
          : undefined,
        fromBlock,
        toBlock
      })
    )) as unknown as RawLaunchCreatedLog[];

    scannedChunkCount += 1;

    for (const log of logs) {
      const launchId = log.args?.launchId;
      const logCreator = log.args?.creator;
      const launchToken = log.args?.launchToken;
      const launchPool = log.args?.launchPool;

      if (
        launchId === undefined ||
        !logCreator ||
        !launchToken ||
        !launchPool ||
        logCreator !== creator
      ) {
        warnings.push({
          label: `LaunchCreated ${fromBlock}-${toBlock}`,
          message: "A Factory log was missing one or more expected indexed launch fields."
        });
        continue;
      }

      launchesById.set(launchId.toString(10), {
        creator: logCreator,
        launchId,
        poolAddress: launchPool,
        tokenAddress: launchToken,
        transactionHash: log.transactionHash ?? undefined
      });
    }

    chunkStart = toBlock + 1n;
  }

  return {
    latestBlock,
    launches: [...launchesById.values()],
    scannedChunkCount,
    warnings
  };
}

async function readCanonicalCreatorLaunches(
  {
    creator,
    references
  }: {
    creator: Address;
    references: readonly CreatorLaunchReference[];
  },
  client: Pick<PublicClient, "readContract">
) {
  const warnings: ArcTokenReadIssue[] = [];

  const launches = await Promise.all(
    references.map(async (reference) => {
      const recordResult = await optionalRead(`Factory launchById(${reference.launchId})`, () =>
        client.readContract({
          address: arcDeployment.factoryAddress,
          abi: launchFactoryAbi,
          functionName: "launchById",
          args: [reference.launchId]
        })
      );

      if (recordResult.warning || !recordResult.value) {
        warnings.push(
          recordResult.warning ?? {
            label: `Factory launchById(${reference.launchId})`,
            message: "The factory launch record could not be loaded."
          }
        );
        return null;
      }

      const record = recordResult.value as LaunchRecordGetter;

      if (
        record.creator !== creator ||
        record.token === zeroAddress ||
        record.pool === zeroAddress
      ) {
        warnings.push({
          label: `Factory launchById(${reference.launchId})`,
          message: "The factory launch record did not match the connected creator profile."
        });
        return null;
      }

      if (record.token !== reference.tokenAddress || record.pool !== reference.poolAddress) {
        warnings.push({
          label: `Launch ${reference.launchId}`,
          message:
            "The Factory event and canonical launch registry disagreed, so the registry addresses were used."
        });
      }

      return {
        creator: record.creator,
        launchId: reference.launchId,
        poolAddress: record.pool,
        tokenAddress: record.token,
        transactionHash: reference.transactionHash
      } satisfies CanonicalCreatorLaunch;
    })
  );

  const filteredLaunches: CanonicalCreatorLaunch[] = launches.filter(
    (launch): launch is NonNullable<typeof launch> => launch !== null
  );

  return {
    launches: filteredLaunches,
    warnings
  };
}

async function readCreatorStatusCounts(
  launches: readonly CanonicalCreatorLaunch[],
  client: Pick<PublicClient, "readContract">
): Promise<CreatorStatusCounts> {
  const counts = {
    activeLaunchCount: 0,
    graduatedLaunchCount: 0,
    graduationPendingLaunchCount: 0
  };
  const warnings: ArcTokenReadIssue[] = [];

  await Promise.all(
    launches.map(async (launch) => {
      const statusResult = await optionalRead(`Pool status(${launch.poolAddress})`, () =>
        client.readContract({
          address: launch.poolAddress,
          abi: launchPoolAbi,
          functionName: "status"
        })
      );

      if (statusResult.warning || statusResult.value === undefined) {
        warnings.push(
          statusResult.warning ?? {
            label: `Pool status(${launch.poolAddress})`,
            message: "The pool status could not be read for this creator launch."
          }
        );
        return;
      }

      const poolStatus = Number(statusResult.value);

      if (poolStatus === 1) {
        counts.activeLaunchCount += 1;
      } else if (poolStatus === 2) {
        counts.graduationPendingLaunchCount += 1;
      } else if (poolStatus === 3) {
        counts.graduatedLaunchCount += 1;
      }
    })
  );

  return {
    ...counts,
    warnings
  };
}

async function readProfileLaunchItem(
  {
    launch,
    walletAddress
  }: {
    launch: CanonicalCreatorLaunch;
    walletAddress: Address;
  },
  client: Pick<PublicClient, "readContract">
): Promise<ReadProfileLaunchItemResult> {
  const warnings: ArcTokenReadIssue[] = [];
  const tokenPageUrl = buildLaunchTokenPagePath(launch.tokenAddress);
  const tokenExplorerUrl = buildArcScanAddressUrl(arcDeployment.explorerUrl, launch.tokenAddress);
  const poolExplorerUrl = buildArcScanAddressUrl(arcDeployment.explorerUrl, launch.poolAddress);

  const [
    nameResult,
    symbolResult,
    decimalsResult,
    walletTokenBalanceResult,
    poolStatusResult,
    canBuyResult,
    canSellResult,
    curveStateResult,
    remainingGraduationCapacityResult
  ] = await Promise.all([
    optionalRead(`Token name(${launch.tokenAddress})`, () =>
      client.readContract({
        address: launch.tokenAddress,
        abi: librarcTokenAbi,
        functionName: "name"
      })
    ),
    optionalRead(`Token symbol(${launch.tokenAddress})`, () =>
      client.readContract({
        address: launch.tokenAddress,
        abi: librarcTokenAbi,
        functionName: "symbol"
      })
    ),
    optionalRead(`Token decimals(${launch.tokenAddress})`, () =>
      client.readContract({
        address: launch.tokenAddress,
        abi: librarcTokenAbi,
        functionName: "decimals"
      })
    ),
    optionalRead(`Wallet balanceOf(${launch.tokenAddress})`, () =>
      client.readContract({
        address: launch.tokenAddress,
        abi: librarcTokenAbi,
        functionName: "balanceOf",
        args: [walletAddress]
      })
    ),
    optionalRead(`Pool status(${launch.poolAddress})`, () =>
      client.readContract({
        address: launch.poolAddress,
        abi: launchPoolAbi,
        functionName: "status"
      })
    ),
    optionalRead(`Pool canBuy(${launch.poolAddress})`, () =>
      client.readContract({
        address: launch.poolAddress,
        abi: launchPoolAbi,
        functionName: "canBuy"
      })
    ),
    optionalRead(`Pool canSell(${launch.poolAddress})`, () =>
      client.readContract({
        address: launch.poolAddress,
        abi: launchPoolAbi,
        functionName: "canSell"
      })
    ),
    optionalRead(`Pool curveState(${launch.poolAddress})`, () =>
      client.readContract({
        address: launch.poolAddress,
        abi: launchPoolAbi,
        functionName: "curveState"
      })
    ),
    optionalRead(`Pool remainingGraduationCapacity(${launch.poolAddress})`, () =>
      client.readContract({
        address: launch.poolAddress,
        abi: launchPoolAbi,
        functionName: "remainingGraduationCapacity"
      })
    )
  ]);

  for (const result of [
    nameResult,
    symbolResult,
    decimalsResult,
    walletTokenBalanceResult,
    poolStatusResult,
    canBuyResult,
    canSellResult,
    curveStateResult,
    remainingGraduationCapacityResult
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

  return {
    item: {
      launchId: toBigIntString(launch.launchId),
      tokenAddress: launch.tokenAddress,
      poolAddress: launch.poolAddress,
      name: nameResult.value,
      symbol: symbolResult.value,
      decimals: decimalsResult.value === undefined ? undefined : Number(decimalsResult.value),
      walletTokenBalance:
        walletTokenBalanceResult.value === undefined
          ? undefined
          : toBigIntString(walletTokenBalanceResult.value),
      poolStatus,
      poolStatusLabel: poolStatus === undefined ? undefined : getPoolStatusLabel(poolStatus),
      canBuy: canBuyResult.value,
      canSell: canSellResult.value,
      realUsdcReserve: realUsdcReserve === undefined ? undefined : toBigIntString(realUsdcReserve),
      graduationProgress,
      remainingGraduationCapacity:
        remainingGraduationCapacity === undefined
          ? undefined
          : toBigIntString(remainingGraduationCapacity),
      tokenPageUrl,
      tokenExplorerUrl,
      poolExplorerUrl,
      transactionHash: launch.transactionHash,
      transactionExplorerUrl: launch.transactionHash
        ? buildArcScanTransactionUrl(arcDeployment.explorerUrl, launch.transactionHash)
        : undefined,
      warnings
    }
  };
}

export async function readArcProfilePage(
  {
    limit,
    page,
    sort,
    walletAddress
  }: {
    limit: number;
    page: number;
    sort: ArcProfileSort;
    walletAddress: Address;
  },
  client: ReadClient = getArcTestnetServerPublicClient()
) {
  const usdcBalanceResult = await optionalRead(`USDC balanceOf(${walletAddress})`, () =>
    client.readContract({
      address: arcDeployment.usdcAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress]
    })
  );

  const logDiscovery = await readCreatorLaunchLogsInChunks({ creator: walletAddress }, client);
  const canonicalLaunches = await readCanonicalCreatorLaunches(
    {
      creator: walletAddress,
      references: logDiscovery.launches
    },
    client
  );
  const orderedLaunches = sortCreatorLaunchReferences(canonicalLaunches.launches, sort);
  const statusCounts = await readCreatorStatusCounts(canonicalLaunches.launches, client);
  const totalCreatedLaunches = orderedLaunches.length;
  const totalPages = totalCreatedLaunches === 0 ? 0 : ceilDiv(totalCreatedLaunches, limit);
  const hasPreviousPage = page > 1 && totalPages > 0;
  const hasNextPage = page < totalPages;
  const pageStart = (page - 1) * limit;
  const paginatedLaunches = orderedLaunches.slice(pageStart, pageStart + limit);
  const launchResults = await Promise.all(
    paginatedLaunches.map((launch) => readProfileLaunchItem({ launch, walletAddress }, client))
  );

  return {
    activeLaunchCount: statusCounts.activeLaunchCount,
    graduatedLaunchCount: statusCounts.graduatedLaunchCount,
    graduationPendingLaunchCount: statusCounts.graduationPendingLaunchCount,
    hasNextPage,
    hasPreviousPage,
    launches: launchResults.map((result) => result.item),
    limit,
    page,
    sort,
    totalCreatedLaunches,
    totalPages,
    usdcBalance:
      usdcBalanceResult.value === undefined ? undefined : toBigIntString(usdcBalanceResult.value),
    walletAddress,
    warnings: [
      ...(usdcBalanceResult.warning ? [usdcBalanceResult.warning] : []),
      ...logDiscovery.warnings,
      ...canonicalLaunches.warnings,
      ...statusCounts.warnings
    ]
  };
}

export function getProfilePaginationSummary({
  page,
  totalCreatedLaunches,
  totalPages
}: {
  page: number;
  totalCreatedLaunches: number;
  totalPages: number;
}) {
  return {
    hasLaunches: totalCreatedLaunches > 0,
    isOutOfRange: totalPages > 0 && page > totalPages
  };
}

export function createProfileRpcFailure(message: string) {
  return toRouteFailure({
    code: "RPC_UNAVAILABLE",
    details: [
      {
        label: "Creator profile",
        message
      }
    ],
    message: "Unable to load the Arc Testnet creator profile right now.",
    status: 503
  });
}

export function createProfileReadIssue(label: string, error: unknown) {
  return toReadIssue(label, error);
}
