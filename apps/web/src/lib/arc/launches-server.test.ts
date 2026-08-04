import assert from "node:assert/strict";
import test from "node:test";

import { getAddress, type Address, type Hex } from "viem";

import { ARC_FACTORY_DEPLOYMENT_BLOCK } from "./config";
import { getGraduationPercentage } from "./format";
import { buildArcLaunchesApiPath } from "./launches-api";
import {
  DEFAULT_LAUNCHES_PAGE_SIZE,
  MAX_DISCOVER_LOG_BLOCK_RANGE,
  getDiscoverLogChunkToBlock,
  getLaunchIdsForPage,
  getPoolFilterLabel,
  matchesLaunchSearch,
  parseLaunchesLimitParam,
  readFactoryLaunchesPage
} from "./launches-server";

type LaunchesReadClient = NonNullable<Parameters<typeof readFactoryLaunchesPage>[1]>;
type MockGetBlockParameters = {
  blockNumber: bigint;
};
type MockGetLogsParameters = {
  address?: Address | Address[];
  args?: {
    launchId?: bigint;
  };
  event: {
    name: string;
  };
  fromBlock?: bigint;
  toBlock?: bigint | "latest";
};
type MockReadContractParameters = {
  address: Address;
  args?: readonly unknown[];
  functionName: string;
};

type LaunchFixture = {
  canBuy?: boolean;
  canSell?: boolean;
  creator: Address;
  description?: string;
  launchId: bigint;
  name: string;
  pool: Address;
  poolStatus?: number;
  realTokenReserve: bigint;
  realUsdcReserve: bigint;
  remainingGraduationCapacity?: bigint;
  symbol: string;
  token: Address;
  totalSupply?: bigint;
  virtualTokenReserve: bigint;
  virtualUsdcReserve: bigint;
};

type LaunchFixtureInput = Omit<
  LaunchFixture,
  "realTokenReserve" | "realUsdcReserve" | "virtualTokenReserve" | "virtualUsdcReserve"
> &
  Partial<
    Pick<
      LaunchFixture,
      "realTokenReserve" | "realUsdcReserve" | "virtualTokenReserve" | "virtualUsdcReserve"
    >
  >;

type TradeLogFixture = {
  blockNumber: bigint;
  grossUsdcAmountOut?: bigint;
  logIndex: number;
  pool: Address;
  transactionHash: Hex;
  usdcAmountIn?: bigint;
};

function addressAt(value: number) {
  return getAddress(`0x${value.toString(16).padStart(40, "0")}`);
}

function buildMetadataUri(description: string | undefined) {
  return `data:application/json,${encodeURIComponent(JSON.stringify({ description }))}`;
}

function createLaunchFixture({
  canBuy = true,
  canSell = true,
  creator,
  description = "Arc Test launch",
  launchId,
  name,
  pool,
  poolStatus = 1,
  realTokenReserve = 500_000_000n * 10n ** 18n,
  realUsdcReserve = 10_000_000n,
  remainingGraduationCapacity = 90_000_000n,
  symbol,
  token,
  totalSupply = 1_000_000_000n * 10n ** 18n,
  virtualTokenReserve = 500_000_000n * 10n ** 18n,
  virtualUsdcReserve = 10_000_000n
}: LaunchFixtureInput): LaunchFixture {
  return {
    canBuy,
    canSell,
    creator,
    description,
    launchId,
    name,
    pool,
    poolStatus,
    realTokenReserve,
    realUsdcReserve,
    remainingGraduationCapacity,
    symbol,
    token,
    totalSupply,
    virtualTokenReserve,
    virtualUsdcReserve
  };
}

function createLaunchesClient({
  blockTimestamps = new Map<bigint, bigint>(),
  buyLogs = [],
  getLogsErrorByEventName = {},
  latestBlock = ARC_FACTORY_DEPLOYMENT_BLOCK,
  launches,
  sellLogs = [],
  totalSupplyReadable = true
}: {
  blockTimestamps?: Map<bigint, bigint>;
  buyLogs?: TradeLogFixture[];
  getLogsErrorByEventName?: Partial<Record<"BuyExecuted" | "SellExecuted", Error>>;
  latestBlock?: bigint;
  launches: LaunchFixture[];
  sellLogs?: TradeLogFixture[];
  totalSupplyReadable?: boolean;
}) {
  const launchesById = new Map(launches.map((launch) => [launch.launchId.toString(10), launch]));
  const launchesByPool = new Map(launches.map((launch) => [launch.pool, launch]));
  const launchesByToken = new Map(launches.map((launch) => [launch.token, launch]));
  const getLogsCalls: Array<{
    eventName: string;
    fromBlock?: bigint;
    toBlock?: bigint | "latest";
  }> = [];

  const client = {
    getBlock: (async ({ blockNumber }: MockGetBlockParameters) => ({
      number: blockNumber,
      timestamp: blockTimestamps.get(blockNumber) ?? 1_000_000n
    })) as LaunchesReadClient["getBlock"],
    getBlockNumber: (async () => latestBlock) as LaunchesReadClient["getBlockNumber"],
    getLogs: (async ({ address, args, event, fromBlock, toBlock }: MockGetLogsParameters) => {
      getLogsCalls.push({
        eventName: event.name,
        fromBlock,
        toBlock
      });

      if (event.name === "LaunchCreated") {
        const launchId = args?.launchId?.toString(10);
        const launch = launchId ? launchesById.get(launchId) : undefined;

        if (!launch) {
          return [];
        }

        return [
          {
            args: {
              metadataUri: buildMetadataUri(launch.description)
            }
          }
        ];
      }

      const pools = Array.isArray(address) ? address : address ? [address] : [];
      const maxBlock = toBlock === "latest" || toBlock === undefined ? latestBlock : toBlock;

      if (event.name === "BuyExecuted") {
        if (getLogsErrorByEventName.BuyExecuted) {
          throw getLogsErrorByEventName.BuyExecuted;
        }

        return buyLogs
          .filter(
            (log) =>
              pools.includes(log.pool) &&
              (fromBlock === undefined || log.blockNumber >= fromBlock) &&
              log.blockNumber <= maxBlock
          )
          .map((log) => ({
            address: log.pool,
            args: {
              usdcAmountIn: log.usdcAmountIn
            },
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
            transactionHash: log.transactionHash
          }));
      }

      if (event.name === "SellExecuted") {
        if (getLogsErrorByEventName.SellExecuted) {
          throw getLogsErrorByEventName.SellExecuted;
        }

        return sellLogs
          .filter(
            (log) =>
              pools.includes(log.pool) &&
              (fromBlock === undefined || log.blockNumber >= fromBlock) &&
              log.blockNumber <= maxBlock
          )
          .map((log) => ({
            address: log.pool,
            args: {
              grossUsdcAmountOut: log.grossUsdcAmountOut
            },
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
            transactionHash: log.transactionHash
          }));
      }

      throw new Error(`unexpected getLogs event ${event.name}`);
    }) as unknown as LaunchesReadClient["getLogs"],
    readContract: (async ({ address, args, functionName }: MockReadContractParameters) => {
      if (functionName === "launchCount") {
        return BigInt(launches.length);
      }

      if (functionName === "launchById") {
        const launchId = String(args?.[0]);
        const launch = launchesById.get(launchId);

        assert.ok(launch, `launch ${launchId} should exist in the fixture`);

        return {
          creator: launch.creator,
          metadataHash: `0x${launch.launchId.toString(16).padStart(64, "0")}` as Hex,
          pool: launch.pool,
          token: launch.token
        };
      }

      if (functionName === "isLibrarcToken") {
        return launchesByToken.has(args?.[0] as Address);
      }

      if (functionName === "isLibrarcPool") {
        return launchesByPool.has(args?.[0] as Address);
      }

      const launch = launchesByToken.get(address) ?? launchesByPool.get(address);
      assert.ok(launch, `fixture should include a contract record for ${address}`);

      if (functionName === "name") {
        return launch.name;
      }

      if (functionName === "symbol") {
        return launch.symbol;
      }

      if (functionName === "decimals") {
        return 18;
      }

      if (functionName === "totalSupply") {
        if (!totalSupplyReadable) {
          throw new Error("token totalSupply read failed");
        }

        return launch.totalSupply;
      }

      if (functionName === "status") {
        return launch.poolStatus;
      }

      if (functionName === "canBuy") {
        return launch.canBuy;
      }

      if (functionName === "canSell") {
        return launch.canSell;
      }

      if (functionName === "curveState") {
        return {
          accruedProtocolFees: 0n,
          realTokenReserve: launch.realTokenReserve,
          realUsdcReserve: launch.realUsdcReserve,
          virtualTokenReserve: launch.virtualTokenReserve,
          virtualUsdcReserve: launch.virtualUsdcReserve
        };
      }

      if (functionName === "remainingGraduationCapacity") {
        return launch.remainingGraduationCapacity;
      }

      throw new Error(`unexpected function ${functionName}`);
    }) as LaunchesReadClient["readContract"]
  } satisfies LaunchesReadClient;

  return {
    client,
    getLogsCalls
  };
}

const launchOne = createLaunchFixture({
  creator: addressAt(0x11),
  launchId: 1n,
  name: "Arc Nova",
  pool: addressAt(0x31),
  symbol: "ARCN",
  token: addressAt(0x21)
});

const launchTwo = createLaunchFixture({
  creator: addressAt(0x12),
  launchId: 2n,
  name: "Blue Current",
  pool: addressAt(0x32),
  realUsdcReserve: 20_000_000n,
  symbol: "BLUE",
  token: addressAt(0x22),
  virtualUsdcReserve: 20_000_000n
});

const launchThree = createLaunchFixture({
  creator: addressAt(0x13),
  launchId: 3n,
  name: "Cinder Flux",
  pool: addressAt(0x33),
  realUsdcReserve: 15_000_000n,
  symbol: "CNDR",
  token: addressAt(0x23),
  virtualUsdcReserve: 5_000_000n
});

test("page-size maximum is enforced", () => {
  assert.throws(
    () => parseLaunchesLimitParam("25"),
    (error: unknown) => {
      assert.equal(
        error && typeof error === "object" && "message" in error ? error.message : undefined,
        "limit cannot exceed 24."
      );

      return true;
    }
  );
});

test("newest ordering uses one-based launch ids descending from launchCount", () => {
  assert.deepEqual(
    getLaunchIdsForPage({
      launchCount: 25,
      limit: 3,
      page: 1,
      sort: "newest"
    }),
    [25n, 24n, 23n]
  );
});

test("oldest ordering uses one-based launch ids ascending from 1", () => {
  assert.deepEqual(
    getLaunchIdsForPage({
      launchCount: 25,
      limit: 3,
      page: 1,
      sort: "oldest"
    }),
    [1n, 2n, 3n]
  );
});

test("builds the public launches api path without requiring a wallet", () => {
  assert.equal(
    buildArcLaunchesApiPath({
      page: 2,
      sort: "recentBuys",
      timeFilter: "24h"
    }),
    "/api/arc/launches?page=2&sort=recentBuys&timeFilter=24h"
  );
});

test("pool-status derived paused filter uses real availability flags", () => {
  assert.equal(getPoolFilterLabel({ poolStatus: 1, canBuy: false, canSell: true }), "paused");
  assert.equal(getPoolFilterLabel({ poolStatus: 1, canBuy: true, canSell: true }), "active");
  assert.equal(
    getPoolFilterLabel({ poolStatus: 2, canBuy: false, canSell: false }),
    "graduation-pending"
  );
  assert.equal(getPoolFilterLabel({ poolStatus: 3, canBuy: false, canSell: false }), "graduated");
});

test("graduation percentage remains bounded from 0 to 100", () => {
  assert.equal(getGraduationPercentage(0n, 0n), 0);
  assert.equal(getGraduationPercentage(50n, 50n), 50);
  assert.equal(getGraduationPercentage(100n, 0n), 100);
});

test("search normalization matches names, symbols, and addresses safely", () => {
  assert.equal(
    matchesLaunchSearch(
      {
        creator: launchOne.creator,
        creatorExplorerUrl: "https://testnet.arcscan.app/address/creator",
        hasCanonicalError: false,
        launchId: "1",
        name: launchOne.name,
        poolAddress: launchOne.pool,
        poolExplorerUrl: "https://testnet.arcscan.app/address/pool",
        symbol: launchOne.symbol,
        tokenAddress: launchOne.token,
        tokenExplorerUrl: "https://testnet.arcscan.app/address/token",
        tokenPageUrl: `/token/${launchOne.token}`,
        warnings: []
      },
      "arc"
    ),
    true
  );
  assert.equal(
    matchesLaunchSearch(
      {
        creator: launchOne.creator,
        creatorExplorerUrl: "https://testnet.arcscan.app/address/creator",
        hasCanonicalError: false,
        launchId: "1",
        name: launchOne.name,
        poolAddress: launchOne.pool,
        poolExplorerUrl: "https://testnet.arcscan.app/address/pool",
        symbol: launchOne.symbol,
        tokenAddress: launchOne.token,
        tokenExplorerUrl: "https://testnet.arcscan.app/address/token",
        tokenPageUrl: `/token/${launchOne.token}`,
        warnings: []
      },
      launchOne.token.toLowerCase()
    ),
    true
  );
});

test("discover log chunk helper stays within the configured maximum range", () => {
  const toBlock = getDiscoverLogChunkToBlock({
    chunkStart: ARC_FACTORY_DEPLOYMENT_BLOCK,
    latestBlock: ARC_FACTORY_DEPLOYMENT_BLOCK + 20_500n
  });

  assert.equal(toBlock - ARC_FACTORY_DEPLOYMENT_BLOCK + 1n, MAX_DISCOVER_LOG_BLOCK_RANGE);
});

test("zero-launch factories return an empty result instead of fake data", async () => {
  const { client } = createLaunchesClient({
    launches: []
  });
  const result = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: DEFAULT_LAUNCHES_PAGE_SIZE,
      sort: "newest",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );

  assert.equal(result.items.length, 0);
  assert.equal(result.totalLaunchCount, 0);
  assert.equal(result.totalPages, 0);
  assert.equal(result.popularItems.length, 0);
});

test("popular ordering uses genuine market cap when the curve data supports it", async () => {
  const { client } = createLaunchesClient({
    launches: [launchOne, launchTwo, launchThree]
  });
  const result = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 12,
      sort: "marketCap",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );

  assert.equal(result.popularMetricKind, "marketCap");
  assert.equal(result.popularMetricLabel, "Market cap");
  assert.deepEqual(
    result.popularItems.map((item) => item.launchId),
    ["2", "3", "1"]
  );
  assert.equal(result.items[0]?.marketCap, "40000000");
});

test("market-cap fallback is not mislabeled when the required totalSupply read is unavailable", async () => {
  const { client } = createLaunchesClient({
    launches: [launchOne, launchTwo],
    totalSupplyReadable: false
  });
  const result = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 12,
      sort: "marketCap",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );

  assert.equal(result.popularMetricKind, "realUsdcReserve");
  assert.equal(result.popularMetricLabel, "Largest real USDC reserves");
  assert.equal(result.popularItems[0]?.realUsdcReserve, "20000000");
  assert.equal(result.popularItems[0]?.marketCap, undefined);
});

test("newest and oldest sorting preserve factory launch ordering", async () => {
  const { client } = createLaunchesClient({
    launches: [launchOne, launchTwo, launchThree]
  });

  const newest = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 3,
      sort: "newest",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );
  const oldest = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 3,
      sort: "oldest",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );

  assert.deepEqual(
    newest.items.map((item) => item.launchId),
    ["3", "2", "1"]
  );
  assert.deepEqual(
    oldest.items.map((item) => item.launchId),
    ["1", "2", "3"]
  );
});

test("recent-buy ordering uses the latest confirmed buy block and log index", async () => {
  const latestBlock = ARC_FACTORY_DEPLOYMENT_BLOCK + 250n;
  const { client } = createLaunchesClient({
    buyLogs: [
      {
        blockNumber: latestBlock - 5n,
        logIndex: 1,
        pool: launchOne.pool,
        transactionHash: `0x${"1".repeat(64)}` as Hex,
        usdcAmountIn: 1_000_000n
      },
      {
        blockNumber: latestBlock - 5n,
        logIndex: 4,
        pool: launchTwo.pool,
        transactionHash: `0x${"2".repeat(64)}` as Hex,
        usdcAmountIn: 2_000_000n
      }
    ],
    launches: [launchOne, launchTwo],
    latestBlock
  });
  const result = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 12,
      sort: "recentBuys",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );

  assert.deepEqual(
    result.items.map((item) => item.launchId),
    ["2", "1"]
  );
  assert.equal(result.items[0]?.lastBuyLogIndex, 4);
});

test("volume ordering uses BuyExecuted.usdcAmountIn plus SellExecuted.grossUsdcAmountOut", async () => {
  const latestBlock = ARC_FACTORY_DEPLOYMENT_BLOCK + 400n;
  const { client } = createLaunchesClient({
    buyLogs: [
      {
        blockNumber: latestBlock - 3n,
        logIndex: 1,
        pool: launchOne.pool,
        transactionHash: `0x${"3".repeat(64)}` as Hex,
        usdcAmountIn: 4_000_000n
      }
    ],
    launches: [launchOne, launchTwo],
    latestBlock,
    sellLogs: [
      {
        blockNumber: latestBlock - 2n,
        grossUsdcAmountOut: 3_000_000n,
        logIndex: 2,
        pool: launchOne.pool,
        transactionHash: `0x${"4".repeat(64)}` as Hex
      },
      {
        blockNumber: latestBlock - 1n,
        grossUsdcAmountOut: 2_000_000n,
        logIndex: 3,
        pool: launchTwo.pool,
        transactionHash: `0x${"5".repeat(64)}` as Hex
      }
    ]
  });
  const result = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 12,
      sort: "volume",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );

  assert.equal(result.items[0]?.launchId, "1");
  assert.equal(result.items[0]?.volume, "7000000");
  assert.equal(result.items[1]?.volume, "2000000");
});

test("all, 24h, and 7d time filters use real block timestamps", async () => {
  const latestBlock = ARC_FACTORY_DEPLOYMENT_BLOCK + 700n;
  const recentBlock = latestBlock - 1n;
  const dayOldBlock = latestBlock - 2n;
  const staleBlock = latestBlock - 3n;
  const latestTimestamp = 1_000_000n;
  const blockTimestamps = new Map<bigint, bigint>([
    [latestBlock, latestTimestamp],
    [recentBlock, latestTimestamp - 3_600n],
    [dayOldBlock, latestTimestamp - 200_000n],
    [staleBlock, latestTimestamp - 700_000n]
  ]);
  const { client } = createLaunchesClient({
    blockTimestamps,
    buyLogs: [
      {
        blockNumber: recentBlock,
        logIndex: 1,
        pool: launchOne.pool,
        transactionHash: `0x${"6".repeat(64)}` as Hex,
        usdcAmountIn: 2_000_000n
      },
      {
        blockNumber: dayOldBlock,
        logIndex: 2,
        pool: launchTwo.pool,
        transactionHash: `0x${"7".repeat(64)}` as Hex,
        usdcAmountIn: 3_000_000n
      },
      {
        blockNumber: staleBlock,
        logIndex: 3,
        pool: launchThree.pool,
        transactionHash: `0x${"8".repeat(64)}` as Hex,
        usdcAmountIn: 4_000_000n
      }
    ],
    launches: [launchOne, launchTwo, launchThree],
    latestBlock
  });

  const allTime = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 12,
      sort: "volume",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );
  const oneDay = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 12,
      sort: "volume",
      status: "all",
      search: "",
      timeFilter: "24h"
    },
    client
  );
  const sevenDays = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 12,
      sort: "volume",
      status: "all",
      search: "",
      timeFilter: "7d"
    },
    client
  );

  assert.equal(allTime.items.find((item) => item.launchId === "3")?.volume, "4000000");
  assert.equal(oneDay.items.find((item) => item.launchId === "2")?.volume, "0");
  assert.equal(sevenDays.items.find((item) => item.launchId === "2")?.volume, "3000000");
  assert.equal(sevenDays.items.find((item) => item.launchId === "3")?.volume, "0");
});

test("duplicate trade logs are removed before volume is calculated", async () => {
  const latestBlock = ARC_FACTORY_DEPLOYMENT_BLOCK + 800n;
  const duplicateLog = {
    blockNumber: latestBlock - 2n,
    logIndex: 5,
    pool: launchOne.pool,
    transactionHash: `0x${"9".repeat(64)}` as Hex,
    usdcAmountIn: 5_000_000n
  } satisfies TradeLogFixture;
  const { client } = createLaunchesClient({
    buyLogs: [duplicateLog, duplicateLog],
    launches: [launchOne],
    latestBlock
  });
  const result = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 12,
      sort: "volume",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );

  assert.equal(result.items[0]?.volume, "5000000");
});

test("bounded event queries chunk reads across the deployment range", async () => {
  const latestBlock = ARC_FACTORY_DEPLOYMENT_BLOCK + 20_500n;
  const { client, getLogsCalls } = createLaunchesClient({
    launches: [launchOne],
    latestBlock
  });

  await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 12,
      sort: "volume",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );

  const eventCalls = getLogsCalls.filter((call) => call.eventName !== "LaunchCreated");

  assert.equal(eventCalls.length, 6);
  for (const call of eventCalls) {
    assert.ok(call.fromBlock !== undefined);
    assert.ok(call.toBlock !== undefined && call.toBlock !== "latest");
    assert.ok(call.toBlock - call.fromBlock + 1n <= MAX_DISCOVER_LOG_BLOCK_RANGE);
  }
});

test("rpc failures are not treated as zero volume and do not fail the whole page", async () => {
  const { client } = createLaunchesClient({
    getLogsErrorByEventName: {
      BuyExecuted: new Error("RPC Request failed")
    },
    launches: [launchOne]
  });
  const result = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 12,
      sort: "volume",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );

  assert.equal(result.items[0]?.volume, undefined);
  assert.ok(result.items[0]?.metricWarningCount);
  assert.ok(result.warnings.length > 0);
});

test("partial optional read failures do not fail the entire launch page", async () => {
  const { client } = createLaunchesClient({
    launches: [launchOne]
  });
  const partialClient = {
    ...client,
    readContract: (async (parameters: MockReadContractParameters) => {
      if (parameters.functionName === "name") {
        throw new Error("token name read failed");
      }

      return client.readContract(parameters as never);
    }) as LaunchesReadClient["readContract"]
  } satisfies LaunchesReadClient;
  const result = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 1,
      sort: "newest",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    partialClient
  );

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.symbol, "ARCN");
  assert.ok((result.items[0]?.warnings.length ?? 0) >= 1);
});

test("server launch reads use only public read methods and keep token-page urls stable", async () => {
  const { client } = createLaunchesClient({
    launches: [launchOne]
  });
  const result = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 1,
      sort: "oldest",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );

  assert.equal(result.items[0]?.tokenPageUrl, `/token/${launchOne.token}`);
});

test("pagination remains stable for filtered discover results", async () => {
  const { client } = createLaunchesClient({
    launches: [launchOne, launchTwo, launchThree]
  });
  const result = await readFactoryLaunchesPage(
    {
      page: 2,
      limit: 1,
      sort: "newest",
      status: "all",
      search: "",
      timeFilter: "all"
    },
    client
  );

  assert.equal(result.currentPage, 2);
  assert.equal(result.totalPages, 3);
  assert.equal(result.items[0]?.launchId, "2");
});
