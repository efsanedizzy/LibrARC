import assert from "node:assert/strict";
import test from "node:test";

import { getAddress } from "viem";

import { getGraduationPercentage } from "./format";
import { buildArcLaunchesApiPath } from "./launches-api";
import {
  DEFAULT_LAUNCHES_PAGE_SIZE,
  getLaunchIdsForPage,
  getPoolFilterLabel,
  matchesLaunchSearch,
  parseLaunchesLimitParam,
  readFactoryLaunchesPage
} from "./launches-server";

const creator = getAddress("0x1111111111111111111111111111111111111111");
const token = getAddress("0x2222222222222222222222222222222222222222");
const pool = getAddress("0x3333333333333333333333333333333333333333");
const launchMetadataHash = `0x${"a".repeat(64)}` as const;

type LaunchesReadClient = NonNullable<Parameters<typeof readFactoryLaunchesPage>[1]>;
type MockReadContractParameters = {
  args?: readonly unknown[];
  functionName: string;
};
type MockReadContract = (parameters: MockReadContractParameters) => Promise<unknown>;

function createLaunchesClient({
  getLogs,
  readContract
}: {
  getLogs?: LaunchesReadClient["getLogs"];
  readContract: MockReadContract;
}): LaunchesReadClient {
  // Viem's public-client methods are heavily generic; a narrow test adapter keeps the mocks readable.
  return {
    getLogs: (getLogs ?? (async () => [])) as LaunchesReadClient["getLogs"],
    readContract: readContract as LaunchesReadClient["readContract"]
  } as LaunchesReadClient;
}

function createSuccessfulReadContract({
  accruedProtocolFees = 0n,
  canBuy = true,
  canSell = true,
  launchCount = 1n,
  name = "Arc Nova",
  symbol = "ARCN"
}: {
  accruedProtocolFees?: bigint;
  canBuy?: boolean;
  canSell?: boolean;
  launchCount?: bigint;
  name?: string;
  symbol?: string;
} = {}) {
  return async ({ args, functionName }: MockReadContractParameters): Promise<unknown> => {
    if (functionName === "launchCount") {
      return launchCount;
    }

    if (functionName === "launchById") {
      assert.deepEqual(args, [1n]);
      return {
        creator,
        token,
        pool,
        metadataHash: launchMetadataHash
      };
    }

    if (functionName === "isLibrarcToken" || functionName === "isLibrarcPool") {
      return true;
    }

    if (functionName === "name") {
      return name;
    }

    if (functionName === "symbol") {
      return symbol;
    }

    if (functionName === "decimals") {
      return 18;
    }

    if (functionName === "totalSupply") {
      return 1_000_000_000n * 10n ** 18n;
    }

    if (functionName === "status") {
      return 1;
    }

    if (functionName === "canBuy") {
      return canBuy;
    }

    if (functionName === "canSell") {
      return canSell;
    }

    if (functionName === "curveState") {
      return {
        realUsdcReserve: 10_000_000n,
        realTokenReserve: 500_000_000n * 10n ** 18n,
        virtualUsdcReserve: 1n,
        virtualTokenReserve: 1n,
        accruedProtocolFees
      };
    }

    if (functionName === "remainingGraduationCapacity") {
      return 90_000_000n;
    }

    throw new Error(`unexpected function ${String(functionName)}`);
  };
}

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
  assert.equal(buildArcLaunchesApiPath(), "/api/arc/launches");
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
        accruedProtocolFees: "0",
        creator,
        creatorExplorerUrl: "https://testnet.arcscan.app/address/creator",
        hasCanonicalError: false,
        launchId: "1",
        name: "Arc Nova",
        poolAddress: pool,
        poolExplorerUrl: "https://testnet.arcscan.app/address/pool",
        symbol: "ARCN",
        tokenAddress: token,
        tokenExplorerUrl: "https://testnet.arcscan.app/address/token",
        tokenPageUrl: `/token/${token}`,
        warnings: []
      },
      "arc"
    ),
    true
  );
  assert.equal(
    matchesLaunchSearch(
      {
        accruedProtocolFees: "0",
        creator,
        creatorExplorerUrl: "https://testnet.arcscan.app/address/creator",
        hasCanonicalError: false,
        launchId: "1",
        name: "Arc Nova",
        poolAddress: pool,
        poolExplorerUrl: "https://testnet.arcscan.app/address/pool",
        symbol: "ARCN",
        tokenAddress: token,
        tokenExplorerUrl: "https://testnet.arcscan.app/address/token",
        tokenPageUrl: `/token/${token}`,
        warnings: []
      },
      token.toLowerCase()
    ),
    true
  );
});

test("zero-launch factories return an empty result instead of fake data", async () => {
  const result = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: DEFAULT_LAUNCHES_PAGE_SIZE,
      sort: "newest",
      status: "all",
      search: ""
    },
    createLaunchesClient({
      readContract: async ({ functionName }: MockReadContractParameters): Promise<unknown> => {
        if (functionName === "launchCount") {
          return 0n;
        }

        throw new Error("unexpected read");
      }
    })
  );

  assert.equal(result.items.length, 0);
  assert.equal(result.totalLaunchCount, 0);
  assert.equal(result.totalPages, 0);
});

test("partial optional read failures do not fail the entire launch page", async () => {
  const result = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 1,
      sort: "newest",
      status: "all",
      search: ""
    },
    createLaunchesClient({
      readContract: async (parameters: MockReadContractParameters): Promise<unknown> => {
        if (parameters.functionName === "name") {
          throw new Error("token name read failed");
        }

        return createSuccessfulReadContract({
          accruedProtocolFees: 500_000n
        })(parameters);
      }
    })
  );

  assert.equal(result.items.length, 1);
  const firstItem = result.items[0];
  assert.ok(firstItem);
  assert.equal("symbol" in firstItem ? firstItem.symbol : undefined, "ARCN");
  assert.equal(firstItem.warnings.length, 1);
});

test("rpc failures are not treated as an empty launch list", async () => {
  await assert.rejects(
    () =>
      readFactoryLaunchesPage(
        {
          page: 1,
          limit: 1,
          sort: "newest",
          status: "all",
          search: ""
        },
        createLaunchesClient({
          readContract: async () => {
            throw new Error("RPC Request failed");
          }
        })
      ),
    (error: unknown) => {
      assert.equal(
        error && typeof error === "object" && "code" in error ? error.code : undefined,
        "RPC_UNAVAILABLE"
      );
      assert.match(
        error && typeof error === "object" && "message" in error ? String(error.message) : "",
        /Arc Testnet RPC is temporarily unavailable|RPC Request failed/
      );

      return true;
    }
  );
});

test("server launch reads use only public read methods and never require a wallet", async () => {
  const result = await readFactoryLaunchesPage(
    {
      page: 1,
      limit: 1,
      sort: "oldest",
      status: "all",
      search: ""
    },
    createLaunchesClient({
      readContract: createSuccessfulReadContract()
    })
  );

  assert.equal(result.items[0]?.tokenPageUrl, `/token/${token}`);
});
