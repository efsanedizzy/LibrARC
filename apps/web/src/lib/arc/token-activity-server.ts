import { zeroAddress, type Address, type Hex, type PublicClient } from "viem";

import { ARC_FACTORY_DEPLOYMENT_BLOCK, arcDeployment } from "./config";
import { buildArcScanAddressUrl, buildArcScanTransactionUrl } from "./launch-metadata";
import { getArcTestnetServerPublicClient } from "./server-client";
import {
  ensureAddress,
  optionalRead,
  readWithRetry,
  toBigIntString,
  toRouteFailure,
  type ArcRouteFailure
} from "./server-routes";
import { type ArcTokenReadIssue } from "./token-api";

export const DEFAULT_TOKEN_ACTIVITY_PAGE_SIZE = 25;
export const MAX_TOKEN_ACTIVITY_PAGE_SIZE = 50;
export const TOKEN_ACTIVITY_LOG_BLOCK_RANGE = 10_000n;
export const TOKEN_ACTIVITY_LOG_BLOCK_CHUNK_SIZE = TOKEN_ACTIVITY_LOG_BLOCK_RANGE - 1n;
export const MAX_TRADE_SCAN_BLOCK_RANGE = 500_000n;
export const MAX_HOLDER_SCAN_BLOCK_RANGE = 500_000n;
export const MAX_HOLDER_LOGS_PROCESSED = 20_000;

type ReadClient = Pick<PublicClient, "getBlock" | "getBlockNumber" | "getLogs" | "readContract">;

type LaunchCreatedLog = {
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

type BuyExecutedLog = {
  address?: Address;
  args?: {
    buyer?: Address;
    recipient?: Address;
    usdcAmountIn?: bigint;
    fee?: bigint;
    netUsdcIn?: bigint;
    tokenAmountOut?: bigint;
  };
  blockNumber?: bigint | null;
  logIndex?: number | null;
  transactionHash?: Hex | null;
  transactionIndex?: number | null;
};

type SellExecutedLog = {
  address?: Address;
  args?: {
    seller?: Address;
    recipient?: Address;
    tokenAmountIn?: bigint;
    grossUsdcAmountOut?: bigint;
    fee?: bigint;
    netUsdcAmountOut?: bigint;
  };
  blockNumber?: bigint | null;
  logIndex?: number | null;
  transactionHash?: Hex | null;
  transactionIndex?: number | null;
};

type TransferLog = {
  args?: {
    from?: Address;
    to?: Address;
    value?: bigint;
  };
  blockNumber?: bigint | null;
  logIndex?: number | null;
  transactionHash?: Hex | null;
};

type CanonicalActivityContext = {
  client: ReadClient;
  creator?: Address;
  latestBlock: bigint;
  poolAddress: Address;
  startBlock: bigint;
  tokenAddress: Address;
  tokenDecimals: number;
  tokenTotalSupply: bigint;
};

type ParsedTradeRecord = {
  blockNumber: bigint;
  fee: bigint;
  grossUsdcAmount: bigint;
  kind: "buy" | "sell";
  logIndex: number;
  netUsdcAmount: bigint;
  recipient?: Address;
  timestamp?: bigint;
  tokenAmount: bigint;
  trader: Address;
  transactionHash: Hex;
  transactionIndex?: number;
};

type HolderBalanceMap = Map<Address, bigint>;

const launchCreatedEvent = {
  type: "event",
  name: "LaunchCreated",
  anonymous: false,
  inputs: [
    { indexed: true, name: "launchId", type: "uint256" },
    { indexed: true, name: "creator", type: "address" },
    { indexed: true, name: "launchToken", type: "address" },
    { indexed: false, name: "launchPool", type: "address" },
    { indexed: false, name: "name", type: "string" },
    { indexed: false, name: "symbol", type: "string" },
    { indexed: false, name: "metadataUri", type: "string" },
    { indexed: false, name: "metadataHash", type: "bytes32" }
  ]
} as const;

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

const transferEvent = {
  type: "event",
  name: "Transfer",
  anonymous: false,
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "value", type: "uint256" }
  ]
} as const;

function createActivityFailure(
  code:
    | "CONTRACT_READ_FAILED"
    | "INVALID_ADDRESS"
    | "INVALID_REQUEST"
    | "POOL_NOT_RESOLVED"
    | "RPC_UNAVAILABLE"
    | "UNREGISTERED_TOKEN",
  label: string,
  message: string,
  status: number
) {
  return {
    code,
    details: [{ label, message }],
    message,
    status
  };
}

function remapCanonicalError(error: unknown) {
  const failure = error as Partial<ArcRouteFailure>;

  if (!failure || typeof failure !== "object" || typeof failure.code !== "string") {
    throw error;
  }

  if (failure.code === "TOKEN_NOT_REGISTERED") {
    throw createActivityFailure(
      "UNREGISTERED_TOKEN",
      "Factory isLibrarcToken()",
      failure.message ?? "This token is not registered in the active Arc Testnet LaunchFactory.",
      404
    );
  }

  if (failure.code === "POOL_NOT_RESOLVED") {
    throw createActivityFailure(
      "POOL_NOT_RESOLVED",
      failure.details?.[0]?.label ?? "Factory poolByToken()",
      failure.message ?? "The canonical LaunchPool could not be resolved for this token.",
      failure.status ?? 409
    );
  }

  throw error;
}

function invalidActivityRequest(label: string, message: string) {
  throw toRouteFailure({
    code: "INVALID_REQUEST",
    details: [{ label, message }],
    message,
    status: 400
  });
}

export function parseTokenActivityPageParam(value: string | null) {
  if (!value) {
    return 1;
  }

  if (!/^\d+$/.test(value)) {
    invalidActivityRequest("page", "page must be a positive integer.");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    invalidActivityRequest("page", "page must be a positive integer.");
  }

  return parsed;
}

export function parseTokenActivityLimitParam(value: string | null) {
  if (!value) {
    return DEFAULT_TOKEN_ACTIVITY_PAGE_SIZE;
  }

  if (!/^\d+$/.test(value)) {
    invalidActivityRequest("limit", "limit must be a positive integer.");
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    invalidActivityRequest("limit", "limit must be a positive integer.");
  }

  if (parsed > MAX_TOKEN_ACTIVITY_PAGE_SIZE) {
    invalidActivityRequest("limit", `limit cannot exceed ${MAX_TOKEN_ACTIVITY_PAGE_SIZE}.`);
  }

  return parsed;
}

export function getForwardChunkToBlock({
  chunkStart,
  latestBlock
}: {
  chunkStart: bigint;
  latestBlock: bigint;
}) {
  const candidateToBlock = chunkStart + TOKEN_ACTIVITY_LOG_BLOCK_CHUNK_SIZE;

  return candidateToBlock > latestBlock ? latestBlock : candidateToBlock;
}

export function getReverseChunkFromBlock({
  latestChunkEnd,
  startBlock
}: {
  latestChunkEnd: bigint;
  startBlock: bigint;
}) {
  const candidateFromBlock =
    latestChunkEnd > TOKEN_ACTIVITY_LOG_BLOCK_CHUNK_SIZE
      ? latestChunkEnd - TOKEN_ACTIVITY_LOG_BLOCK_CHUNK_SIZE
      : 0n;

  return candidateFromBlock < startBlock ? startBlock : candidateFromBlock;
}

export function compareTradeRecordsDescending(left: ParsedTradeRecord, right: ParsedTradeRecord) {
  if (left.blockNumber !== right.blockNumber) {
    return left.blockNumber > right.blockNumber ? -1 : 1;
  }

  if (
    left.transactionIndex !== undefined &&
    right.transactionIndex !== undefined &&
    left.transactionIndex !== right.transactionIndex
  ) {
    return left.transactionIndex > right.transactionIndex ? -1 : 1;
  }

  if (left.logIndex === right.logIndex) {
    return 0;
  }

  return left.logIndex > right.logIndex ? -1 : 1;
}

export function dedupeByTransactionHashAndLogIndex<
  T extends {
    logIndex: number;
    transactionHash: Hex;
  }
>(records: readonly T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];

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

export function applyTransferToBalances({
  balances,
  from,
  to,
  value
}: {
  balances: HolderBalanceMap;
  from: Address;
  to: Address;
  value: bigint;
}) {
  if (from !== zeroAddress) {
    balances.set(from, (balances.get(from) ?? 0n) - value);
  }

  if (to !== zeroAddress) {
    balances.set(to, (balances.get(to) ?? 0n) + value);
  }
}

export function finalizeHolderBalances(balances: HolderBalanceMap) {
  return [...balances.entries()]
    .filter((entry) => entry[1] > 0n)
    .map(([address, balance]) => ({ address, balance }))
    .sort((left, right) => {
      if (left.balance === right.balance) {
        return left.address.localeCompare(right.address);
      }

      return left.balance > right.balance ? -1 : 1;
    });
}

export function formatSharePercent({
  balance,
  totalSupply
}: {
  balance: bigint;
  totalSupply: bigint;
}) {
  if (totalSupply === 0n) {
    return "0%";
  }

  const scaledPercent = (balance * 10_000_000n) / totalSupply;
  const whole = scaledPercent / 100_000n;
  const fraction = (scaledPercent % 100_000n).toString(10).padStart(5, "0").replace(/0+$/, "");

  return fraction ? `${whole.toString(10)}.${fraction}%` : `${whole.toString(10)}%`;
}

function getAddressTitle(value: Address) {
  return ensureAddress(value, "address");
}

async function resolveCanonicalActivityContext(
  tokenAddress: Address,
  client: ReadClient = getArcTestnetServerPublicClient()
): Promise<CanonicalActivityContext> {
  let canonicalPoolAddress: Address;

  try {
    const isRegisteredToken = await readWithRetry("Factory isLibrarcToken()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: [
          {
            type: "function",
            name: "isLibrarcToken",
            stateMutability: "view",
            inputs: [{ name: "token", type: "address" }],
            outputs: [{ name: "", type: "bool" }]
          }
        ] as const,
        functionName: "isLibrarcToken",
        args: [tokenAddress]
      })
    );

    if (!isRegisteredToken) {
      throw createActivityFailure(
        "UNREGISTERED_TOKEN",
        "Factory isLibrarcToken()",
        "This token address is not registered in the active Arc Testnet LaunchFactory.",
        404
      );
    }

    canonicalPoolAddress = await readWithRetry("Factory poolByToken()", () =>
      client.readContract({
        address: arcDeployment.factoryAddress,
        abi: [
          {
            type: "function",
            name: "poolByToken",
            stateMutability: "view",
            inputs: [{ name: "token", type: "address" }],
            outputs: [{ name: "", type: "address" }]
          }
        ] as const,
        functionName: "poolByToken",
        args: [tokenAddress]
      })
    );
  } catch (error) {
    remapCanonicalError(error);
    throw error;
  }

  if (canonicalPoolAddress === zeroAddress) {
    throw createActivityFailure(
      "POOL_NOT_RESOLVED",
      "Factory poolByToken()",
      "The factory returned the zero address instead of a LaunchPool.",
      409
    );
  }

  const [tokenDecimalsResult, tokenTotalSupplyResult, latestBlock] = await Promise.all([
    readWithRetry("Token decimals()", () =>
      client.readContract({
        address: tokenAddress,
        abi: [
          {
            type: "function",
            name: "decimals",
            stateMutability: "view",
            inputs: [],
            outputs: [{ name: "", type: "uint8" }]
          }
        ] as const,
        functionName: "decimals"
      })
    ),
    readWithRetry("Token totalSupply()", () =>
      client.readContract({
        address: tokenAddress,
        abi: [
          {
            type: "function",
            name: "totalSupply",
            stateMutability: "view",
            inputs: [],
            outputs: [{ name: "", type: "uint256" }]
          }
        ] as const,
        functionName: "totalSupply"
      })
    ),
    readWithRetry("Arc latest block", () => client.getBlockNumber())
  ]);

  let startBlock = ARC_FACTORY_DEPLOYMENT_BLOCK;
  let creator: Address | undefined;
  let chunkStart = ARC_FACTORY_DEPLOYMENT_BLOCK;

  while (chunkStart <= latestBlock) {
    const toBlock = getForwardChunkToBlock({
      chunkStart,
      latestBlock
    });
    const launchLogs = (await readWithRetry(
      `Factory LaunchCreated logs ${chunkStart}-${toBlock}`,
      () =>
        client.getLogs({
          address: arcDeployment.factoryAddress,
          event: launchCreatedEvent,
          args: {
            launchToken: tokenAddress
          },
          fromBlock: chunkStart,
          toBlock
        })
    )) as unknown as LaunchCreatedLog[];
    const foundLog = launchLogs.find(
      (log) =>
        log.args?.launchToken === tokenAddress &&
        log.args.launchPool === canonicalPoolAddress &&
        log.args.creator !== undefined &&
        log.blockNumber !== undefined &&
        log.blockNumber !== null
    );

    if (
      foundLog?.args?.creator &&
      foundLog.blockNumber !== null &&
      foundLog.blockNumber !== undefined
    ) {
      creator = foundLog.args.creator;
      startBlock = foundLog.blockNumber;
      break;
    }

    if (toBlock === latestBlock) {
      break;
    }

    chunkStart = toBlock + 1n;
  }

  return {
    client,
    creator,
    latestBlock,
    poolAddress: canonicalPoolAddress,
    startBlock,
    tokenAddress,
    tokenDecimals: Number(tokenDecimalsResult),
    tokenTotalSupply: tokenTotalSupplyResult
  };
}

async function readBlockTimestamps(
  {
    blockNumbers
  }: {
    blockNumbers: readonly bigint[];
  },
  client: Pick<PublicClient, "getBlock">
) {
  const timestamps = new Map<bigint, bigint>();
  const warnings: ArcTokenReadIssue[] = [];

  await Promise.all(
    [...new Set(blockNumbers.map((value) => value.toString(10)))].map(async (value) => {
      const blockNumber = BigInt(value);
      const result = await optionalRead(`Block ${blockNumber}`, () =>
        client.getBlock({
          blockNumber
        })
      );

      if (result.warning) {
        warnings.push(result.warning);
        return;
      }

      if (result.value && "timestamp" in result.value) {
        timestamps.set(blockNumber, BigInt(result.value.timestamp));
      }
    })
  );

  return {
    timestamps,
    warnings
  };
}

export async function readTokenTradesActivity(
  {
    limit,
    page,
    tokenAddress
  }: {
    limit: number;
    page: number;
    tokenAddress: Address;
  },
  client: ReadClient = getArcTestnetServerPublicClient()
) {
  const context = await resolveCanonicalActivityContext(tokenAddress, client);
  const offset = (page - 1) * limit;
  const targetCount = offset + limit + 1;
  const records: ParsedTradeRecord[] = [];
  let processedBlockRange = 0n;
  let chunkEnd = context.latestBlock;
  let reachedStartBlock = context.latestBlock < context.startBlock;
  let hitScanLimit = false;

  while (chunkEnd >= context.startBlock && records.length < targetCount) {
    const chunkFromBlock = getReverseChunkFromBlock({
      latestChunkEnd: chunkEnd,
      startBlock: context.startBlock
    });
    const currentChunkSize = chunkEnd - chunkFromBlock + 1n;

    if (processedBlockRange + currentChunkSize > MAX_TRADE_SCAN_BLOCK_RANGE) {
      hitScanLimit = true;
      break;
    }

    const [buyLogs, sellLogs] = await Promise.all([
      readWithRetry(`Pool BuyExecuted logs ${chunkFromBlock}-${chunkEnd}`, () =>
        context.client.getLogs({
          address: context.poolAddress,
          event: buyExecutedEvent,
          fromBlock: chunkFromBlock,
          toBlock: chunkEnd
        })
      ),
      readWithRetry(`Pool SellExecuted logs ${chunkFromBlock}-${chunkEnd}`, () =>
        context.client.getLogs({
          address: context.poolAddress,
          event: sellExecutedEvent,
          fromBlock: chunkFromBlock,
          toBlock: chunkEnd
        })
      )
    ]);

    processedBlockRange += currentChunkSize;

    for (const log of buyLogs as unknown as BuyExecutedLog[]) {
      if (
        log.address !== context.poolAddress ||
        !log.args?.buyer ||
        log.args.usdcAmountIn === undefined ||
        log.args.netUsdcIn === undefined ||
        log.args.fee === undefined ||
        log.args.tokenAmountOut === undefined ||
        !log.transactionHash ||
        log.logIndex === null ||
        log.logIndex === undefined ||
        log.blockNumber === null ||
        log.blockNumber === undefined
      ) {
        continue;
      }

      records.push({
        blockNumber: log.blockNumber,
        fee: log.args.fee,
        grossUsdcAmount: log.args.usdcAmountIn,
        kind: "buy",
        logIndex: log.logIndex,
        netUsdcAmount: log.args.netUsdcIn,
        recipient: log.args.recipient,
        tokenAmount: log.args.tokenAmountOut,
        trader: log.args.buyer,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex ?? undefined
      });
    }

    for (const log of sellLogs as unknown as SellExecutedLog[]) {
      if (
        log.address !== context.poolAddress ||
        !log.args?.seller ||
        log.args.grossUsdcAmountOut === undefined ||
        log.args.netUsdcAmountOut === undefined ||
        log.args.fee === undefined ||
        log.args.tokenAmountIn === undefined ||
        !log.transactionHash ||
        log.logIndex === null ||
        log.logIndex === undefined ||
        log.blockNumber === null ||
        log.blockNumber === undefined
      ) {
        continue;
      }

      records.push({
        blockNumber: log.blockNumber,
        fee: log.args.fee,
        grossUsdcAmount: log.args.grossUsdcAmountOut,
        kind: "sell",
        logIndex: log.logIndex,
        netUsdcAmount: log.args.netUsdcAmountOut,
        recipient: log.args.recipient,
        tokenAmount: log.args.tokenAmountIn,
        trader: log.args.seller,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex ?? undefined
      });
    }

    if (chunkFromBlock === context.startBlock) {
      reachedStartBlock = true;
      break;
    }

    chunkEnd = chunkFromBlock - 1n;
  }

  const dedupedRecords = dedupeByTransactionHashAndLogIndex(records).sort(
    compareTradeRecordsDescending
  );
  const paginatedRecords = dedupedRecords.slice(offset, offset + limit);
  const timestamps = await readBlockTimestamps(
    {
      blockNumbers: paginatedRecords.map((record) => record.blockNumber)
    },
    context.client
  );
  const warnings = [...timestamps.warnings];

  if (hitScanLimit) {
    warnings.push({
      label: "Recent trades",
      message:
        "Recent trade history was read with bounded block scanning. Older trades may not be included in this page."
    });
  }

  return {
    hasNextPage: dedupedRecords.length > offset + limit || (!reachedStartBlock && hitScanLimit),
    hasPreviousPage: page > 1,
    latestBlock: toBigIntString(context.latestBlock),
    limit,
    page,
    poolAddress: context.poolAddress,
    startBlock: toBigIntString(context.startBlock),
    tokenAddress: context.tokenAddress,
    trades: paginatedRecords.map((record) => ({
      blockNumber: toBigIntString(record.blockNumber),
      fee: toBigIntString(record.fee),
      grossUsdcAmount: toBigIntString(record.grossUsdcAmount),
      kind: record.kind,
      logIndex: record.logIndex,
      netUsdcAmount: toBigIntString(record.netUsdcAmount),
      poolExplorerUrl: buildArcScanAddressUrl(arcDeployment.explorerUrl, context.poolAddress),
      recipient: record.recipient,
      timestamp:
        timestamps.timestamps.get(record.blockNumber) === undefined
          ? undefined
          : toBigIntString(timestamps.timestamps.get(record.blockNumber) ?? 0n),
      tokenAmount: toBigIntString(record.tokenAmount),
      trader: record.trader,
      transactionExplorerUrl: buildArcScanTransactionUrl(
        arcDeployment.explorerUrl,
        record.transactionHash
      ),
      transactionHash: record.transactionHash,
      transactionIndex: record.transactionIndex
    })),
    warnings
  };
}

function getHolderRole({
  address,
  creator,
  poolAddress,
  tokenAddress
}: {
  address: Address;
  creator?: Address;
  poolAddress: Address;
  tokenAddress: Address;
}) {
  if (creator && address === creator) {
    return "creator" as const;
  }

  if (address === poolAddress) {
    return "pool" as const;
  }

  if (
    address === tokenAddress ||
    address === arcDeployment.factoryAddress ||
    address === arcDeployment.feeVaultAddress ||
    address === arcDeployment.stagingAdapterAddress ||
    address === arcDeployment.usdcAddress
  ) {
    return "contract" as const;
  }

  return undefined;
}

export async function readTokenHoldersActivity(
  {
    limit,
    page,
    tokenAddress
  }: {
    limit: number;
    page: number;
    tokenAddress: Address;
  },
  client: ReadClient = getArcTestnetServerPublicClient()
) {
  const context = await resolveCanonicalActivityContext(tokenAddress, client);
  const offset = (page - 1) * limit;
  const balances = new Map<Address, bigint>();
  const transferLogs = new Array<{
    from: Address;
    to: Address;
    value: bigint;
    transactionHash: Hex;
    logIndex: number;
  }>();
  let chunkStart = context.startBlock;
  let processedBlockRange = 0n;
  let processedLogCount = 0;
  let complete = true;

  while (chunkStart <= context.latestBlock) {
    const chunkToBlock = getForwardChunkToBlock({
      chunkStart,
      latestBlock: context.latestBlock
    });
    const currentChunkSize = chunkToBlock - chunkStart + 1n;

    if (processedBlockRange + currentChunkSize > MAX_HOLDER_SCAN_BLOCK_RANGE) {
      complete = false;
      break;
    }

    const logs = (await readWithRetry(`Token Transfer logs ${chunkStart}-${chunkToBlock}`, () =>
      context.client.getLogs({
        address: tokenAddress,
        event: transferEvent,
        fromBlock: chunkStart,
        toBlock: chunkToBlock
      })
    )) as unknown as TransferLog[];

    processedBlockRange += currentChunkSize;

    for (const log of logs) {
      if (
        !log.args?.from ||
        !log.args.to ||
        log.args.value === undefined ||
        !log.transactionHash ||
        log.logIndex === null ||
        log.logIndex === undefined
      ) {
        continue;
      }

      transferLogs.push({
        from: getAddressTitle(log.args.from),
        to: getAddressTitle(log.args.to),
        value: log.args.value,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex
      });
      processedLogCount += 1;

      if (processedLogCount > MAX_HOLDER_LOGS_PROCESSED) {
        complete = false;
        break;
      }
    }

    if (!complete || chunkToBlock === context.latestBlock) {
      break;
    }

    chunkStart = chunkToBlock + 1n;
  }

  for (const log of dedupeByTransactionHashAndLogIndex(transferLogs)) {
    applyTransferToBalances({
      balances,
      from: log.from,
      to: log.to,
      value: log.value
    });
  }

  const finalizedBalances = finalizeHolderBalances(balances);
  const paginatedBalances = finalizedBalances.slice(offset, offset + limit);
  const warnings: ArcTokenReadIssue[] = [];

  if (!complete) {
    warnings.push({
      label: "Holders",
      message: "Holder data is partially indexed. Verified balances are shown below."
    });
  }

  return {
    complete,
    hasNextPage: finalizedBalances.length > offset + limit,
    hasPreviousPage: page > 1,
    holderCount: complete ? finalizedBalances.length : undefined,
    holders: paginatedBalances.map((holder, index) => ({
      address: holder.address,
      balance: toBigIntString(holder.balance),
      explorerUrl: buildArcScanAddressUrl(arcDeployment.explorerUrl, holder.address),
      rank: offset + index + 1,
      role: getHolderRole({
        address: holder.address,
        creator: context.creator,
        poolAddress: context.poolAddress,
        tokenAddress: context.tokenAddress
      }),
      sharePercent: complete
        ? formatSharePercent({
            balance: holder.balance,
            totalSupply: context.tokenTotalSupply
          })
        : undefined
    })),
    latestBlock: toBigIntString(context.latestBlock),
    limit,
    page,
    poolAddress: context.poolAddress,
    startBlock: toBigIntString(context.startBlock),
    tokenAddress: context.tokenAddress,
    totalSupply: toBigIntString(context.tokenTotalSupply),
    warnings
  };
}
