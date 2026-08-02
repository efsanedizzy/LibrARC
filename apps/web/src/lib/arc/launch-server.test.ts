import assert from "node:assert/strict";
import test from "node:test";

import { getAddress } from "viem";

import { quoteInitialLaunchPurchase, simulateLaunchTransaction } from "./launch-server";

function createFactoryReadMock() {
  return async ({ functionName }: { functionName: string }) => {
    switch (functionName) {
      case "paused":
        return false;
      case "quoteAsset":
        return getAddress("0x3600000000000000000000000000000000000000");
      case "feeVault":
      case "liquidityAdapter":
      case "liquidityRecipient":
        return getAddress("0x2222222222222222222222222222222222222222");
      case "buyFeeBps":
        return 100n;
      case "sellFeeBps":
        return 100n;
      case "graduationThreshold":
        return 10_000_000n;
      case "virtualUsdcReserve":
        return 5_000_000n;
      case "virtualTokenReserve":
        return 1_000_000_000n * 10n ** 18n;
      case "maxMetadataUriLength":
        return 4_096n;
      case "launchCount":
        return 1n;
      default:
        throw new Error(`unexpected read: ${String(functionName)}`);
    }
  };
}

test("server launch simulation uses only the public simulation path and never signs", async () => {
  let called = false;

  const result = await simulateLaunchTransaction(
    {
      account: getAddress("0x1111111111111111111111111111111111111111"),
      mode: "createLaunch",
      name: "Arc Nova",
      symbol: "ARCN",
      metadataUri: "data:application/json,%7B%22name%22%3A%22Arc%20Nova%22%7D"
    },
    {
      readContract: createFactoryReadMock() as never,
      simulateContract: (async () => {
        called = true;

        return {
          request: {},
          result: [
            getAddress("0x2222222222222222222222222222222222222222"),
            getAddress("0x3333333333333333333333333333333333333333"),
            7n
          ]
        };
      }) as never
    }
  );

  assert.equal(called, true);
  assert.equal(result.mode, "createLaunch");
  assert.equal(result.request.functionName, "createLaunch");
  assert.equal(result.simulation.launchId, 7n);
});

test("server launch simulation supports the exact createLaunchAndBuy path", async () => {
  let readCalls = 0;
  let simulated = false;

  const result = await simulateLaunchTransaction(
    {
      account: getAddress("0x1111111111111111111111111111111111111111"),
      mode: "createLaunchAndBuy",
      name: "Arc Nova",
      symbol: "ARCN",
      metadataUri: "data:application/json,%7B%22name%22%3A%22Arc%20Nova%22%7D",
      usdcAmountIn: 2_500_000n,
      minTokenAmountOut: 123n,
      deadline: 1_234_567_890n
    },
    {
      readContract: (async (input: { functionName: string }) => {
        readCalls += 1;
        return createFactoryReadMock()(input);
      }) as never,
      simulateContract: (async ({
        functionName,
        args
      }: {
        args: unknown[];
        functionName: string;
      }) => {
        simulated = true;
        assert.equal(functionName, "createLaunchAndBuy");
        assert.deepEqual(args, [
          "Arc Nova",
          "ARCN",
          "data:application/json,%7B%22name%22%3A%22Arc%20Nova%22%7D",
          2_500_000n,
          123n,
          1_234_567_890n,
          getAddress("0x1111111111111111111111111111111111111111")
        ]);

        return {
          request: {},
          result: [
            getAddress("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
            getAddress("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
            8n,
            999n
          ]
        };
      }) as never
    }
  );

  assert.ok(readCalls > 0);
  assert.equal(simulated, true);
  assert.equal(result.mode, "createLaunchAndBuy");
  assert.equal(result.request.functionName, "createLaunchAndBuy");
  assert.equal(result.simulation.launchId, 8n);
  assert.equal(result.simulation.tokenAmountOut, 999n);
});

test("initial launch buy quoting uses config-backed math without a signer", async () => {
  const simulated = false;

  const result = await quoteInitialLaunchPurchase(
    {
      name: "Arc Nova",
      symbol: "ARCN",
      metadataUri: "data:application/json,%7B%22name%22%3A%22Arc%20Nova%22%7D",
      usdcAmountIn: 2_500_000n
    },
    {
      readContract: createFactoryReadMock() as never
    }
  );

  assert.equal(simulated, false);
  assert.equal(result.config.factory.buyFeeBps, 100n);
  assert.ok(result.quote.tokenAmountOut > 0n);
  assert.equal(result.quote.nextState.realUsdcReserve, 2_475_000n);
});
