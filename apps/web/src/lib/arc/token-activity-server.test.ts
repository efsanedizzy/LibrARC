import assert from "node:assert/strict";
import test from "node:test";

import { getAddress, zeroAddress, type Address, type Hex } from "viem";

import { ARC_FACTORY_DEPLOYMENT_BLOCK, arcDeployment } from "./config";
import {
  MAX_HOLDER_LOGS_PROCESSED,
  TOKEN_ACTIVITY_LOG_BLOCK_RANGE,
  applyTransferToBalances,
  compareTradeRecordsDescending,
  dedupeByTransactionHashAndLogIndex,
  finalizeHolderBalances,
  formatSharePercent,
  getForwardChunkToBlock,
  getReverseChunkFromBlock,
  parseTokenActivityLimitParam,
  readTokenHoldersActivity,
  readTokenTradesActivity
} from "./token-activity-server";

type ActivityReadClient = NonNullable<Parameters<typeof readTokenTradesActivity>[1]>;
type MockReadContractParameters = {
  address: Address;
  args?: readonly unknown[];
  functionName: string;
};
type MockGetBlockParameters = {
  blockNumber: bigint;
};
type MockGetLogsParameters = {
  address?: Address;
  args?: {
    launchToken?: Address;
  };
  event: {
    name: string;
  };
  fromBlock?: bigint;
  toBlock?: bigint;
};

type BuyFixture = {
  blockNumber: bigint;
  buyer: Address;
  fee: bigint;
  logIndex: number;
  netUsdcIn: bigint;
  poolAddress: Address;
  recipient: Address;
  tokenAmountOut: bigint;
  transactionHash: Hex;
  transactionIndex?: number;
  usdcAmountIn: bigint;
};

type SellFixture = {
  blockNumber: bigint;
  fee: bigint;
  grossUsdcAmountOut: bigint;
  logIndex: number;
  netUsdcAmountOut: bigint;
  poolAddress: Address;
  recipient: Address;
  seller: Address;
  tokenAmountIn: bigint;
  transactionHash: Hex;
  transactionIndex?: number;
};

type TransferFixture = {
  blockNumber: bigint;
  from: Address;
  logIndex: number;
  to: Address;
  transactionHash: Hex;
  value: bigint;
};

const tokenAddress = getAddress("0x1385964841Fb1Cd3a1f4f553615320D375125290");
const poolAddress = getAddress("0xf6F0232b8b4544566AE8C9f3925E655A13556B29");
const creatorAddress = getAddress("0xeAfa56ebd1dA977D67aD0e8E86F9bAD5A6003030");
const traderA = getAddress("0x1111111111111111111111111111111111111111");
const traderB = getAddress("0x2222222222222222222222222222222222222222");
const traderC = getAddress("0x3333333333333333333333333333333333333333");
const latestBlock = ARC_FACTORY_DEPLOYMENT_BLOCK + 25_000n;
const canonicalLaunchBlock = ARC_FACTORY_DEPLOYMENT_BLOCK + 50n;
const totalSupply = 1_000_000_000n * 10n ** 18n;

function createActivityClient({
  blockTimestamps = new Map<bigint, bigint>(),
  buyLogs = [],
  failBlockNumbers = new Set<bigint>(),
  failTrades = false,
  latest = latestBlock,
  launchCreatedLogs = [
    {
      args: {
        creator: creatorAddress,
        launchId: 7n,
        launchPool: poolAddress,
        launchToken: tokenAddress
      },
      blockNumber: canonicalLaunchBlock,
      logIndex: 1,
      transactionHash: `0x${"a".repeat(64)}` as Hex
    }
  ],
  sellLogs = [],
  transferLogs = [],
  transferLogsByChunk,
  tokenRegistered = true
}: {
  blockTimestamps?: Map<bigint, bigint>;
  buyLogs?: BuyFixture[];
  failBlockNumbers?: Set<bigint>;
  failTrades?: boolean;
  latest?: bigint;
  launchCreatedLogs?: Array<{
    args: {
      creator?: Address;
      launchId?: bigint;
      launchPool?: Address;
      launchToken?: Address;
    };
    blockNumber: bigint;
    logIndex: number;
    transactionHash: Hex;
  }>;
  sellLogs?: SellFixture[];
  transferLogs?: TransferFixture[];
  transferLogsByChunk?: (parameters: MockGetLogsParameters) => TransferFixture[];
  tokenRegistered?: boolean;
}) {
  const getLogsCalls: MockGetLogsParameters[] = [];
  const getBlockCalls: bigint[] = [];

  const client = {
    getBlock: (async ({ blockNumber }: MockGetBlockParameters) => {
      getBlockCalls.push(blockNumber);

      if (failBlockNumbers.has(blockNumber)) {
        throw new Error("block timestamp lookup failed");
      }

      return {
        number: blockNumber,
        timestamp: blockTimestamps.get(blockNumber) ?? 1_000_000n
      };
    }) as ActivityReadClient["getBlock"],
    getBlockNumber: (async () => latest) as ActivityReadClient["getBlockNumber"],
    getLogs: (async (parameters: MockGetLogsParameters) => {
      getLogsCalls.push(parameters);

      if (parameters.event.name === "LaunchCreated") {
        return launchCreatedLogs.filter(
          (log) =>
            (parameters.fromBlock === undefined || log.blockNumber >= parameters.fromBlock) &&
            (parameters.toBlock === undefined || log.blockNumber <= parameters.toBlock) &&
            (!parameters.args?.launchToken || log.args.launchToken === parameters.args.launchToken)
        );
      }

      if (
        failTrades &&
        (parameters.event.name === "BuyExecuted" || parameters.event.name === "SellExecuted")
      ) {
        throw new Error("RPC Request failed");
      }

      if (parameters.event.name === "BuyExecuted") {
        return buyLogs
          .filter(
            (log) =>
              log.poolAddress === parameters.address &&
              (parameters.fromBlock === undefined || log.blockNumber >= parameters.fromBlock) &&
              (parameters.toBlock === undefined || log.blockNumber <= parameters.toBlock)
          )
          .map((log) => ({
            address: log.poolAddress,
            args: {
              buyer: log.buyer,
              fee: log.fee,
              netUsdcIn: log.netUsdcIn,
              recipient: log.recipient,
              tokenAmountOut: log.tokenAmountOut,
              usdcAmountIn: log.usdcAmountIn
            },
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
            transactionHash: log.transactionHash,
            transactionIndex: log.transactionIndex
          }));
      }

      if (parameters.event.name === "SellExecuted") {
        return sellLogs
          .filter(
            (log) =>
              log.poolAddress === parameters.address &&
              (parameters.fromBlock === undefined || log.blockNumber >= parameters.fromBlock) &&
              (parameters.toBlock === undefined || log.blockNumber <= parameters.toBlock)
          )
          .map((log) => ({
            address: log.poolAddress,
            args: {
              fee: log.fee,
              grossUsdcAmountOut: log.grossUsdcAmountOut,
              netUsdcAmountOut: log.netUsdcAmountOut,
              recipient: log.recipient,
              seller: log.seller,
              tokenAmountIn: log.tokenAmountIn
            },
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
            transactionHash: log.transactionHash,
            transactionIndex: log.transactionIndex
          }));
      }

      if (parameters.event.name === "Transfer") {
        const source = transferLogsByChunk ? transferLogsByChunk(parameters) : transferLogs;

        return source
          .filter(
            (log) =>
              (parameters.fromBlock === undefined || log.blockNumber >= parameters.fromBlock) &&
              (parameters.toBlock === undefined || log.blockNumber <= parameters.toBlock)
          )
          .map((log) => ({
            args: {
              from: log.from,
              to: log.to,
              value: log.value
            },
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
            transactionHash: log.transactionHash
          }));
      }

      throw new Error(`unexpected log read: ${parameters.event.name}`);
    }) as ActivityReadClient["getLogs"],
    readContract: (async ({ address, args, functionName }: MockReadContractParameters) => {
      if (address === arcDeployment.factoryAddress && functionName === "isLibrarcToken") {
        return tokenRegistered && args?.[0] === tokenAddress;
      }

      if (address === arcDeployment.factoryAddress && functionName === "poolByToken") {
        return args?.[0] === tokenAddress ? poolAddress : zeroAddress;
      }

      if (address === tokenAddress && functionName === "decimals") {
        return 18;
      }

      if (address === tokenAddress && functionName === "totalSupply") {
        return totalSupply;
      }

      throw new Error(`unexpected read ${functionName} at ${address}`);
    }) as ActivityReadClient["readContract"]
  } satisfies ActivityReadClient;

  return {
    client,
    getBlockCalls,
    getLogsCalls
  };
}

test("token-activity limit parsing enforces the configured maximum", () => {
  assert.equal(parseTokenActivityLimitParam(null), 25);
  assert.equal(parseTokenActivityLimitParam("50"), 50);
  assert.throws(() => parseTokenActivityLimitParam("51"));
});

test("forward activity chunks stay within the 10,000-block inclusive limit", () => {
  const toBlock = getForwardChunkToBlock({
    chunkStart: ARC_FACTORY_DEPLOYMENT_BLOCK,
    latestBlock: ARC_FACTORY_DEPLOYMENT_BLOCK + 22_000n
  });

  assert.equal(toBlock - ARC_FACTORY_DEPLOYMENT_BLOCK + 1n, TOKEN_ACTIVITY_LOG_BLOCK_RANGE);
});

test("reverse activity chunks stay within the 10,000-block inclusive limit", () => {
  const fromBlock = getReverseChunkFromBlock({
    latestChunkEnd: latestBlock,
    startBlock: canonicalLaunchBlock
  });

  assert.equal(latestBlock - fromBlock + 1n, TOKEN_ACTIVITY_LOG_BLOCK_RANGE);
});

test("duplicate transaction-hash and log-index pairs are removed", () => {
  const duplicateRecord = {
    logIndex: 1,
    transactionHash: `0x${"b".repeat(64)}` as Hex
  };

  assert.equal(dedupeByTransactionHashAndLogIndex([duplicateRecord, duplicateRecord]).length, 1);
});

test("trade ordering sorts by block, then transaction index, then log index descending", () => {
  const ordered = [
    {
      blockNumber: 9n,
      fee: 0n,
      grossUsdcAmount: 0n,
      kind: "buy" as const,
      logIndex: 1,
      netUsdcAmount: 0n,
      tokenAmount: 0n,
      trader: traderA,
      transactionHash: `0x${"1".repeat(64)}` as Hex,
      transactionIndex: 1
    },
    {
      blockNumber: 9n,
      fee: 0n,
      grossUsdcAmount: 0n,
      kind: "buy" as const,
      logIndex: 2,
      netUsdcAmount: 0n,
      tokenAmount: 0n,
      trader: traderA,
      transactionHash: `0x${"2".repeat(64)}` as Hex,
      transactionIndex: 2
    }
  ].sort(compareTradeRecordsDescending);

  assert.equal(ordered[0]?.transactionIndex, 2);
});

test("buy activity uses the exact BuyExecuted event semantics", async () => {
  const { client } = createActivityClient({
    buyLogs: [
      {
        blockNumber: latestBlock - 2n,
        buyer: traderA,
        fee: 10_000n,
        logIndex: 4,
        netUsdcIn: 990_000n,
        poolAddress,
        recipient: traderB,
        tokenAmountOut: 19_799_803_981_000_000_000_000n,
        transactionHash: `0x${"3".repeat(64)}` as Hex,
        transactionIndex: 3,
        usdcAmountIn: 1_000_000n
      }
    ]
  });

  const result = await readTokenTradesActivity(
    {
      limit: 25,
      page: 1,
      tokenAddress
    },
    client
  );

  assert.equal(result.trades[0]?.kind, "buy");
  assert.equal(result.trades[0]?.grossUsdcAmount, "1000000");
  assert.equal(result.trades[0]?.netUsdcAmount, "990000");
  assert.equal(result.trades[0]?.fee, "10000");
  assert.equal(result.trades[0]?.trader, traderA);
  assert.equal(result.trades[0]?.recipient, traderB);
});

test("sell activity uses the exact SellExecuted event semantics", async () => {
  const { client } = createActivityClient({
    sellLogs: [
      {
        blockNumber: latestBlock - 1n,
        fee: 5_000n,
        grossUsdcAmountOut: 250_000n,
        logIndex: 2,
        netUsdcAmountOut: 245_000n,
        poolAddress,
        recipient: traderC,
        seller: traderB,
        tokenAmountIn: 1_000_000_000_000_000_000n,
        transactionHash: `0x${"4".repeat(64)}` as Hex,
        transactionIndex: 1
      }
    ]
  });

  const result = await readTokenTradesActivity(
    {
      limit: 25,
      page: 1,
      tokenAddress
    },
    client
  );

  assert.equal(result.trades[0]?.kind, "sell");
  assert.equal(result.trades[0]?.grossUsdcAmount, "250000");
  assert.equal(result.trades[0]?.netUsdcAmount, "245000");
  assert.equal(result.trades[0]?.fee, "5000");
});

test("unrelated logs are ignored and only the canonical pool is used", async () => {
  const { client } = createActivityClient({
    buyLogs: [
      {
        blockNumber: latestBlock - 2n,
        buyer: traderA,
        fee: 1n,
        logIndex: 1,
        netUsdcIn: 99n,
        poolAddress: getAddress("0x9999999999999999999999999999999999999999"),
        recipient: traderA,
        tokenAmountOut: 5n,
        transactionHash: `0x${"5".repeat(64)}` as Hex,
        usdcAmountIn: 100n
      }
    ]
  });

  const result = await readTokenTradesActivity(
    {
      limit: 25,
      page: 1,
      tokenAddress
    },
    client
  );

  assert.equal(result.trades.length, 0);
});

test("trade timestamps collapse duplicate block fetches and timestamp failures become warnings", async () => {
  const repeatedBlock = latestBlock - 3n;
  const { client, getBlockCalls } = createActivityClient({
    buyLogs: [
      {
        blockNumber: repeatedBlock,
        buyer: traderA,
        fee: 1n,
        logIndex: 1,
        netUsdcIn: 99n,
        poolAddress,
        recipient: traderA,
        tokenAmountOut: 5n,
        transactionHash: `0x${"6".repeat(64)}` as Hex,
        usdcAmountIn: 100n
      },
      {
        blockNumber: repeatedBlock,
        buyer: traderB,
        fee: 1n,
        logIndex: 2,
        netUsdcIn: 100n,
        poolAddress,
        recipient: traderB,
        tokenAmountOut: 6n,
        transactionHash: `0x${"7".repeat(64)}` as Hex,
        usdcAmountIn: 101n
      }
    ],
    failBlockNumbers: new Set([repeatedBlock])
  });

  const result = await readTokenTradesActivity(
    {
      limit: 25,
      page: 1,
      tokenAddress
    },
    client
  );

  assert.equal(getBlockCalls.length, 1);
  assert.equal(result.trades[0]?.timestamp, undefined);
  assert.ok(result.warnings.length >= 1);
});

test("trade activity begins scanning from the canonical launch-created block", async () => {
  const { client, getLogsCalls } = createActivityClient({
    latest: canonicalLaunchBlock + 15_000n
  });

  await readTokenTradesActivity(
    {
      limit: 25,
      page: 1,
      tokenAddress
    },
    client
  );

  const tradeCalls = getLogsCalls.filter(
    (call) => call.event.name === "BuyExecuted" || call.event.name === "SellExecuted"
  );
  const lastTradeCall = tradeCalls.at(-1);

  assert.ok(lastTradeCall?.fromBlock !== undefined);
  assert.ok(lastTradeCall?.fromBlock >= canonicalLaunchBlock);
});

test("trade activity chunks do not overlap, do not skip blocks, and end at latestBlock", async () => {
  const boundedLatestBlock = canonicalLaunchBlock + TOKEN_ACTIVITY_LOG_BLOCK_RANGE * 2n + 50n;
  const { client, getLogsCalls } = createActivityClient({
    latest: boundedLatestBlock
  });

  await readTokenTradesActivity(
    {
      limit: 25,
      page: 1,
      tokenAddress
    },
    client
  );

  const buyCalls = getLogsCalls.filter((call) => call.event.name === "BuyExecuted");

  assert.ok(buyCalls.length >= 1);
  assert.equal(buyCalls[0]?.toBlock, boundedLatestBlock);

  for (const call of buyCalls) {
    assert.ok(call.fromBlock !== undefined);
    assert.ok(call.toBlock !== undefined);
    assert.ok(call.toBlock - call.fromBlock + 1n <= TOKEN_ACTIVITY_LOG_BLOCK_RANGE);
  }

  for (let index = 1; index < buyCalls.length; index += 1) {
    const newerChunk = buyCalls[index - 1];
    const olderChunk = buyCalls[index];

    assert.ok(newerChunk?.fromBlock !== undefined);
    assert.ok(olderChunk?.toBlock !== undefined);
    assert.equal(newerChunk.fromBlock, olderChunk.toBlock + 1n);
  }
});

test("rpc trade failures are not treated as an empty trade list", async () => {
  const { client } = createActivityClient({
    failTrades: true
  });

  await assert.rejects(
    () =>
      readTokenTradesActivity(
        {
          limit: 25,
          page: 1,
          tokenAddress
        },
        client
      ),
    (error: unknown) => {
      assert.equal(
        error && typeof error === "object" && "code" in error ? error.code : undefined,
        "RPC_UNAVAILABLE"
      );

      return true;
    }
  );
});

test("zero-address mint, regular transfers, and burns aggregate holder balances correctly", () => {
  const balances = new Map<Address, bigint>();

  applyTransferToBalances({
    balances,
    from: zeroAddress,
    to: creatorAddress,
    value: 10n
  });
  applyTransferToBalances({
    balances,
    from: creatorAddress,
    to: traderA,
    value: 4n
  });
  applyTransferToBalances({
    balances,
    from: traderA,
    to: zeroAddress,
    value: 1n
  });

  const finalBalances = finalizeHolderBalances(balances);

  assert.deepEqual(finalBalances, [
    { address: creatorAddress, balance: 6n },
    { address: traderA, balance: 3n }
  ]);
});

test("share percentage uses bigint fixed-point arithmetic", () => {
  assert.equal(
    formatSharePercent({
      balance: 987_510_192_454_000_000_000_000n,
      totalSupply
    }),
    "0.09875%"
  );
});

test("holder activity removes duplicate transfer logs and sorts balances descending", async () => {
  const duplicateLog: TransferFixture = {
    blockNumber: latestBlock - 10n,
    from: zeroAddress,
    logIndex: 1,
    to: creatorAddress,
    transactionHash: `0x${"8".repeat(64)}` as Hex,
    value: 10n
  };
  const { client } = createActivityClient({
    transferLogs: [
      duplicateLog,
      duplicateLog,
      {
        blockNumber: latestBlock - 9n,
        from: creatorAddress,
        logIndex: 2,
        to: traderA,
        transactionHash: `0x${"9".repeat(64)}` as Hex,
        value: 3n
      }
    ]
  });

  const result = await readTokenHoldersActivity(
    {
      limit: 25,
      page: 1,
      tokenAddress
    },
    client
  );

  assert.equal(result.complete, true);
  assert.equal(result.holderCount, 2);
  assert.deepEqual(
    result.holders.map((holder) => [holder.address, holder.balance]),
    [
      [creatorAddress, "7"],
      [traderA, "3"]
    ]
  );
});

test("holder roles are assigned only from canonical creator and canonical pool addresses", async () => {
  const { client } = createActivityClient({
    transferLogs: [
      {
        blockNumber: latestBlock - 10n,
        from: zeroAddress,
        logIndex: 1,
        to: creatorAddress,
        transactionHash: `0x${"c".repeat(64)}` as Hex,
        value: 9n
      },
      {
        blockNumber: latestBlock - 9n,
        from: zeroAddress,
        logIndex: 2,
        to: poolAddress,
        transactionHash: `0x${"d".repeat(64)}` as Hex,
        value: 8n
      }
    ]
  });

  const result = await readTokenHoldersActivity(
    {
      limit: 25,
      page: 1,
      tokenAddress
    },
    client
  );

  assert.equal(result.holders[0]?.role, "creator");
  assert.equal(result.holders[1]?.role, "pool");
});

test("partial holder scans do not claim exact counts or percentages", async () => {
  const logsPerChunk = Array.from({ length: MAX_HOLDER_LOGS_PROCESSED + 2 }, (_, index) => ({
    blockNumber: canonicalLaunchBlock + BigInt(Math.floor(index / 2)),
    from: zeroAddress,
    logIndex: index + 1,
    to: getAddress(`0x${(index + 10).toString(16).padStart(40, "0")}`),
    transactionHash: `0x${(index + 10).toString(16).padStart(64, "0")}` as Hex,
    value: 1n
  }));
  const { client } = createActivityClient({
    transferLogsByChunk: () => logsPerChunk
  });

  const result = await readTokenHoldersActivity(
    {
      limit: 25,
      page: 1,
      tokenAddress
    },
    client
  );

  assert.equal(result.complete, false);
  assert.equal(result.holderCount, undefined);
  assert.equal(result.holders[0]?.sharePercent, undefined);
  assert.ok(result.warnings.length >= 1);
});

test("holder transfer chunks do not overlap, do not skip blocks, and start at the canonical launch block", async () => {
  const boundedLatestBlock = canonicalLaunchBlock + TOKEN_ACTIVITY_LOG_BLOCK_RANGE * 2n + 17n;
  const { client, getLogsCalls } = createActivityClient({
    latest: boundedLatestBlock
  });

  await readTokenHoldersActivity(
    {
      limit: 25,
      page: 1,
      tokenAddress
    },
    client
  );

  const transferCalls = getLogsCalls.filter((call) => call.event.name === "Transfer");

  assert.ok(transferCalls.length >= 1);
  assert.equal(transferCalls[0]?.fromBlock, canonicalLaunchBlock);
  assert.equal(transferCalls.at(-1)?.toBlock, boundedLatestBlock);

  for (const call of transferCalls) {
    assert.ok(call.fromBlock !== undefined);
    assert.ok(call.toBlock !== undefined);
    assert.ok(call.toBlock - call.fromBlock + 1n <= TOKEN_ACTIVITY_LOG_BLOCK_RANGE);
  }

  for (let index = 1; index < transferCalls.length; index += 1) {
    const previous = transferCalls[index - 1];
    const current = transferCalls[index];

    assert.ok(previous?.toBlock !== undefined);
    assert.ok(current?.fromBlock !== undefined);
    assert.equal(current.fromBlock, previous.toBlock + 1n);
  }
});

test("unregistered tokens are rejected", async () => {
  const { client } = createActivityClient({
    tokenRegistered: false
  });

  await assert.rejects(
    () =>
      readTokenTradesActivity(
        {
          limit: 25,
          page: 1,
          tokenAddress
        },
        client
      ),
    (error: unknown) => {
      assert.equal(
        error && typeof error === "object" && "code" in error ? error.code : undefined,
        "UNREGISTERED_TOKEN"
      );

      return true;
    }
  );
});
