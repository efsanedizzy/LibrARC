import assert from "node:assert/strict";
import test from "node:test";

import { getAddress } from "viem";

import { arcDeployment, ARC_FACTORY_DEPLOYMENT_BLOCK } from "./config";
import {
  DEFAULT_PROFILE_PAGE_SIZE,
  MAX_PROFILE_LOG_BLOCK_RANGE,
  MAX_PROFILE_PAGE_SIZE,
  PROFILE_LOG_BLOCK_CHUNK_SIZE,
  getNextProfileLogChunkToBlock,
  isLaunchCreatedCreatorIndexed,
  parseProfileLimitParam,
  readArcProfilePage,
  readCreatorLaunchLogsInChunks
} from "./profile-server";

const creator = getAddress("0x1111111111111111111111111111111111111111");
const tokenA = getAddress("0x2222222222222222222222222222222222222222");
const tokenB = getAddress("0x3333333333333333333333333333333333333333");
const tokenC = getAddress("0x4444444444444444444444444444444444444444");
const poolA = getAddress("0x5555555555555555555555555555555555555555");
const poolB = getAddress("0x6666666666666666666666666666666666666666");
const poolC = getAddress("0x7777777777777777777777777777777777777777");

type ProfileReadClient = NonNullable<Parameters<typeof readArcProfilePage>[1]>;
type MockReadContractParameters = {
  address?: `0x${string}`;
  args?: readonly unknown[];
  functionName: string;
};
type MockGetLogsParameters = {
  args?: {
    creator?: `0x${string}`;
  };
  fromBlock?: bigint;
  toBlock?: bigint;
};
type MockGetLogsResult = Array<{
  args?: {
    creator?: `0x${string}`;
    launchId?: bigint;
    launchPool?: `0x${string}`;
    launchToken?: `0x${string}`;
  };
  blockNumber?: bigint | null;
  logIndex?: number | null;
  transactionHash?: `0x${string}` | null;
}>;

function createProfileClient({
  getBlockNumber,
  getLogs,
  readContract
}: {
  getBlockNumber: () => Promise<bigint>;
  getLogs: (parameters: MockGetLogsParameters) => Promise<MockGetLogsResult>;
  readContract: (parameters: MockReadContractParameters) => Promise<unknown>;
}): ProfileReadClient {
  return {
    getBlockNumber: getBlockNumber as ProfileReadClient["getBlockNumber"],
    getLogs: getLogs as ProfileReadClient["getLogs"],
    readContract: readContract as ProfileReadClient["readContract"]
  };
}

function createLaunchLog({
  launchId,
  launchPool,
  launchToken,
  transactionHash
}: {
  launchId: bigint;
  launchPool: `0x${string}`;
  launchToken: `0x${string}`;
  transactionHash: `0x${string}`;
}) {
  return {
    args: {
      creator,
      launchId,
      launchPool,
      launchToken
    },
    blockNumber: ARC_FACTORY_DEPLOYMENT_BLOCK + launchId,
    logIndex: Number(launchId),
    transactionHash
  };
}

function createSuccessfulReadContract({
  tokenBalanceShouldFail = false
}: {
  tokenBalanceShouldFail?: boolean;
} = {}) {
  return async ({ address, args, functionName }: MockReadContractParameters): Promise<unknown> => {
    if (address === arcDeployment.usdcAddress && functionName === "balanceOf") {
      return 123_456_789n;
    }

    if (address === arcDeployment.factoryAddress && functionName === "launchById") {
      const launchId = args?.[0];

      if (launchId === 1n) {
        return {
          creator,
          token: tokenA,
          pool: poolA,
          metadataHash: `0x${"a".repeat(64)}`
        };
      }

      if (launchId === 2n) {
        return {
          creator,
          token: tokenB,
          pool: poolB,
          metadataHash: `0x${"b".repeat(64)}`
        };
      }

      if (launchId === 3n) {
        return {
          creator,
          token: tokenC,
          pool: poolC,
          metadataHash: `0x${"c".repeat(64)}`
        };
      }
    }

    if (functionName === "status") {
      if (address === poolA) return 1;
      if (address === poolB) return 2;
      if (address === poolC) return 3;
    }

    if (functionName === "canBuy") {
      if (address === poolA) return true;
      if (address === poolB) return false;
      if (address === poolC) return false;
    }

    if (functionName === "canSell") {
      if (address === poolA) return true;
      if (address === poolB) return false;
      if (address === poolC) return false;
    }

    if (functionName === "curveState") {
      if (address === poolA) {
        return {
          realUsdcReserve: 10_000_000n,
          realTokenReserve: 500_000_000n * 10n ** 18n,
          virtualUsdcReserve: 1n,
          virtualTokenReserve: 1n,
          accruedProtocolFees: 100_000n
        };
      }

      if (address === poolB) {
        return {
          realUsdcReserve: 50_000_000n,
          realTokenReserve: 400_000_000n * 10n ** 18n,
          virtualUsdcReserve: 1n,
          virtualTokenReserve: 1n,
          accruedProtocolFees: 200_000n
        };
      }

      if (address === poolC) {
        return {
          realUsdcReserve: 90_000_000n,
          realTokenReserve: 300_000_000n * 10n ** 18n,
          virtualUsdcReserve: 1n,
          virtualTokenReserve: 1n,
          accruedProtocolFees: 300_000n
        };
      }
    }

    if (functionName === "remainingGraduationCapacity") {
      if (address === poolA) return 90_000_000n;
      if (address === poolB) return 50_000_000n;
      if (address === poolC) return 10_000_000n;
    }

    if (functionName === "name") {
      if (address === tokenA) return "Arc Alpha";
      if (address === tokenB) return "Arc Beta";
      if (address === tokenC) return "Arc Gamma";
    }

    if (functionName === "symbol") {
      if (address === tokenA) return "ALPHA";
      if (address === tokenB) return "BETA";
      if (address === tokenC) return "GAMMA";
    }

    if (functionName === "decimals") {
      return 18;
    }

    if (functionName === "balanceOf") {
      if (tokenBalanceShouldFail && address === tokenB) {
        throw new Error("token balance read failed");
      }

      if (address === tokenA) return 4_200n * 10n ** 18n;
      if (address === tokenB) return 7_500n * 10n ** 18n;
      if (address === tokenC) return 9_900n * 10n ** 18n;
    }

    throw new Error(`unexpected read ${String(functionName)} at ${address ?? "unknown"}`);
  };
}

test("profile pagination maximum is enforced", () => {
  assert.equal(parseProfileLimitParam(null), DEFAULT_PROFILE_PAGE_SIZE);
  assert.equal(parseProfileLimitParam(String(MAX_PROFILE_PAGE_SIZE)), MAX_PROFILE_PAGE_SIZE);
  assert.throws(
    () => parseProfileLimitParam(String(MAX_PROFILE_PAGE_SIZE + 1)),
    (error: unknown) => {
      assert.equal(
        error && typeof error === "object" && "message" in error ? error.message : undefined,
        `limit cannot exceed ${MAX_PROFILE_PAGE_SIZE}.`
      );

      return true;
    }
  );
});

test("zero-created-launch wallets return an empty creator profile instead of fake launches", async () => {
  const profile = await readArcProfilePage(
    {
      walletAddress: creator,
      page: 1,
      limit: DEFAULT_PROFILE_PAGE_SIZE,
      sort: "newest"
    },
    createProfileClient({
      getBlockNumber: async () => ARC_FACTORY_DEPLOYMENT_BLOCK,
      getLogs: async () => [],
      readContract: async ({ address, functionName }) => {
        if (address === arcDeployment.usdcAddress && functionName === "balanceOf") {
          return 0n;
        }

        throw new Error("unexpected read");
      }
    })
  );

  assert.equal(profile.totalCreatedLaunches, 0);
  assert.equal(profile.launches.length, 0);
  assert.equal(profile.totalPages, 0);
  assert.equal(profile.usdcBalance, "0");
});

test("LaunchCreated creator filtering uses the verified deployment block and indexed creator", async () => {
  const logCalls: MockGetLogsParameters[] = [];

  await readCreatorLaunchLogsInChunks(
    {
      creator
    },
    createProfileClient({
      getBlockNumber: async () => ARC_FACTORY_DEPLOYMENT_BLOCK,
      getLogs: async (parameters) => {
        logCalls.push(parameters);
        return [];
      },
      readContract: async () => {
        throw new Error("unexpected read");
      }
    })
  );

  assert.equal(logCalls.length, 1);
  assert.equal(logCalls[0]?.fromBlock, ARC_FACTORY_DEPLOYMENT_BLOCK);
  assert.equal(isLaunchCreatedCreatorIndexed(), true);
  assert.equal(logCalls[0]?.args?.creator, creator);
});

test("creator log discovery uses bounded block chunks", async () => {
  const logCalls: MockGetLogsParameters[] = [];

  await readCreatorLaunchLogsInChunks(
    {
      creator
    },
    createProfileClient({
      getBlockNumber: async () => ARC_FACTORY_DEPLOYMENT_BLOCK + PROFILE_LOG_BLOCK_CHUNK_SIZE * 2n,
      getLogs: async (parameters) => {
        logCalls.push(parameters);
        return [];
      },
      readContract: async () => {
        throw new Error("unexpected read");
      }
    })
  );

  assert.equal(logCalls.length, 2);
  assert.equal(logCalls[0]?.fromBlock, ARC_FACTORY_DEPLOYMENT_BLOCK);
  assert.equal(logCalls[0]?.toBlock, ARC_FACTORY_DEPLOYMENT_BLOCK + PROFILE_LOG_BLOCK_CHUNK_SIZE);
  for (const call of logCalls) {
    assert.ok(call.fromBlock !== undefined);
    assert.ok(call.toBlock !== undefined);
    assert.ok(call.toBlock >= call.fromBlock);
    assert.ok(call.toBlock - call.fromBlock + 1n <= MAX_PROFILE_LOG_BLOCK_RANGE);
  }
});

test("profile log chunks do not overlap, do not skip blocks, and end at latestBlock", async () => {
  const latestBlock = ARC_FACTORY_DEPLOYMENT_BLOCK + PROFILE_LOG_BLOCK_CHUNK_SIZE * 2n + 123n;
  const logCalls: MockGetLogsParameters[] = [];

  await readCreatorLaunchLogsInChunks(
    { creator },
    createProfileClient({
      getBlockNumber: async () => latestBlock,
      getLogs: async (parameters) => {
        logCalls.push(parameters);
        return [];
      },
      readContract: async () => {
        throw new Error("unexpected read");
      }
    })
  );

  assert.ok(logCalls.length >= 1);
  assert.equal(logCalls[0]?.fromBlock, ARC_FACTORY_DEPLOYMENT_BLOCK);
  assert.equal(logCalls.at(-1)?.toBlock, latestBlock);

  for (let index = 1; index < logCalls.length; index += 1) {
    const previous = logCalls[index - 1];
    const current = logCalls[index];

    assert.ok(previous?.toBlock !== undefined);
    assert.ok(current?.fromBlock !== undefined);
    assert.equal(current.fromBlock, previous.toBlock + 1n);
  }
});

test("exact-boundary profile log ranges stay within the 10,000-block inclusive limit", () => {
  const latestBlock = ARC_FACTORY_DEPLOYMENT_BLOCK + PROFILE_LOG_BLOCK_CHUNK_SIZE;

  assert.equal(
    getNextProfileLogChunkToBlock({
      chunkStart: ARC_FACTORY_DEPLOYMENT_BLOCK,
      latestBlock
    }),
    latestBlock
  );
  assert.equal(latestBlock - ARC_FACTORY_DEPLOYMENT_BLOCK + 1n, MAX_PROFILE_LOG_BLOCK_RANGE);
});

test("duplicate creator logs are not returned twice", async () => {
  const duplicateLog = createLaunchLog({
    launchId: 1n,
    launchPool: poolA,
    launchToken: tokenA,
    transactionHash: `0x${"1".repeat(64)}`
  });

  const profile = await readArcProfilePage(
    {
      walletAddress: creator,
      page: 1,
      limit: 12,
      sort: "newest"
    },
    createProfileClient({
      getBlockNumber: async () => ARC_FACTORY_DEPLOYMENT_BLOCK + 1n,
      getLogs: async () => [duplicateLog, duplicateLog],
      readContract: createSuccessfulReadContract()
    })
  );

  assert.equal(profile.totalCreatedLaunches, 1);
  assert.equal(profile.launches.length, 1);
});

test("newest and oldest sorting both work for creator launches", async () => {
  const logs = [
    createLaunchLog({
      launchId: 1n,
      launchPool: poolA,
      launchToken: tokenA,
      transactionHash: `0x${"1".repeat(64)}`
    }),
    createLaunchLog({
      launchId: 2n,
      launchPool: poolB,
      launchToken: tokenB,
      transactionHash: `0x${"2".repeat(64)}`
    }),
    createLaunchLog({
      launchId: 3n,
      launchPool: poolC,
      launchToken: tokenC,
      transactionHash: `0x${"3".repeat(64)}`
    })
  ];

  const client = createProfileClient({
    getBlockNumber: async () => ARC_FACTORY_DEPLOYMENT_BLOCK + 3n,
    getLogs: async () => logs,
    readContract: createSuccessfulReadContract()
  });

  const newest = await readArcProfilePage(
    {
      walletAddress: creator,
      page: 1,
      limit: 2,
      sort: "newest"
    },
    client
  );
  const oldest = await readArcProfilePage(
    {
      walletAddress: creator,
      page: 1,
      limit: 2,
      sort: "oldest"
    },
    client
  );

  assert.deepEqual(
    newest.launches.map((launch) => launch.launchId),
    ["3", "2"]
  );
  assert.deepEqual(
    oldest.launches.map((launch) => launch.launchId),
    ["1", "2"]
  );
});

test("creator statistics count active, graduation-pending, and graduated launches", async () => {
  const logs = [
    createLaunchLog({
      launchId: 1n,
      launchPool: poolA,
      launchToken: tokenA,
      transactionHash: `0x${"1".repeat(64)}`
    }),
    createLaunchLog({
      launchId: 2n,
      launchPool: poolB,
      launchToken: tokenB,
      transactionHash: `0x${"2".repeat(64)}`
    }),
    createLaunchLog({
      launchId: 3n,
      launchPool: poolC,
      launchToken: tokenC,
      transactionHash: `0x${"3".repeat(64)}`
    })
  ];

  const profile = await readArcProfilePage(
    {
      walletAddress: creator,
      page: 1,
      limit: 3,
      sort: "newest"
    },
    createProfileClient({
      getBlockNumber: async () => ARC_FACTORY_DEPLOYMENT_BLOCK + 3n,
      getLogs: async () => logs,
      readContract: createSuccessfulReadContract()
    })
  );

  assert.equal(profile.totalCreatedLaunches, 3);
  assert.equal(profile.activeLaunchCount, 1);
  assert.equal(profile.graduationPendingLaunchCount, 1);
  assert.equal(profile.graduatedLaunchCount, 1);
  assert.equal(profile.usdcBalance, "123456789");
});

test("optional token-balance failures create warnings without hiding creator launches", async () => {
  const profile = await readArcProfilePage(
    {
      walletAddress: creator,
      page: 1,
      limit: 3,
      sort: "newest"
    },
    createProfileClient({
      getBlockNumber: async () => ARC_FACTORY_DEPLOYMENT_BLOCK + 2n,
      getLogs: async () => [
        createLaunchLog({
          launchId: 1n,
          launchPool: poolA,
          launchToken: tokenA,
          transactionHash: `0x${"1".repeat(64)}`
        }),
        createLaunchLog({
          launchId: 2n,
          launchPool: poolB,
          launchToken: tokenB,
          transactionHash: `0x${"2".repeat(64)}`
        })
      ],
      readContract: createSuccessfulReadContract({
        tokenBalanceShouldFail: true
      })
    })
  );

  assert.equal(profile.launches.length, 2);
  assert.equal(profile.launches[0]?.warnings.length, 1);
});

test("rpc failures are not treated as an empty creator profile", async () => {
  await assert.rejects(
    () =>
      readArcProfilePage(
        {
          walletAddress: creator,
          page: 1,
          limit: 1,
          sort: "newest"
        },
        createProfileClient({
          getBlockNumber: async () => ARC_FACTORY_DEPLOYMENT_BLOCK,
          getLogs: async () => {
            throw new Error("RPC Request failed");
          },
          readContract: async ({ address, functionName }) => {
            if (address === arcDeployment.usdcAddress && functionName === "balanceOf") {
              return 1n;
            }

            throw new Error("unexpected read");
          }
        })
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

test("creator launches expose token-page and explorer links", async () => {
  const profile = await readArcProfilePage(
    {
      walletAddress: creator,
      page: 1,
      limit: 1,
      sort: "oldest"
    },
    createProfileClient({
      getBlockNumber: async () => ARC_FACTORY_DEPLOYMENT_BLOCK + 1n,
      getLogs: async () => [
        createLaunchLog({
          launchId: 1n,
          launchPool: poolA,
          launchToken: tokenA,
          transactionHash: `0x${"1".repeat(64)}`
        })
      ],
      readContract: createSuccessfulReadContract()
    })
  );

  assert.equal(profile.launches[0]?.tokenPageUrl, `/token/${tokenA}`);
  assert.equal(
    profile.launches[0]?.tokenExplorerUrl,
    `${arcDeployment.explorerUrl}/address/${tokenA}`
  );
  assert.equal(
    profile.launches[0]?.poolExplorerUrl,
    `${arcDeployment.explorerUrl}/address/${poolA}`
  );
  assert.equal(
    profile.launches[0]?.transactionExplorerUrl,
    `${arcDeployment.explorerUrl}/tx/0x${"1".repeat(64)}`
  );
});

test("profile reads succeed with a public read-only client and never require signing", async () => {
  const profile = await readArcProfilePage(
    {
      walletAddress: creator,
      page: 1,
      limit: 1,
      sort: "newest"
    },
    createProfileClient({
      getBlockNumber: async () => ARC_FACTORY_DEPLOYMENT_BLOCK + 1n,
      getLogs: async () => [
        createLaunchLog({
          launchId: 1n,
          launchPool: poolA,
          launchToken: tokenA,
          transactionHash: `0x${"1".repeat(64)}`
        })
      ],
      readContract: createSuccessfulReadContract()
    })
  );

  assert.equal(profile.walletAddress, creator);
  assert.equal(profile.launches.length, 1);
});
