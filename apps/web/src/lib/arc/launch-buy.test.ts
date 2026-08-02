import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateMinimumTokenOutput,
  createInitialLaunchCurveState,
  LaunchInitialBuyQuoteError,
  parseOptionalInitialPurchaseUsdcAmount,
  quoteInitialLaunchBuy
} from "./launch-buy";

test("initial purchase parsing keeps exact 6-decimal Arc USDC precision", () => {
  assert.equal(parseOptionalInitialPurchaseUsdcAmount("1"), 1_000_000n);
  assert.equal(parseOptionalInitialPurchaseUsdcAmount("1.234567"), 1_234_567n);
  assert.equal(parseOptionalInitialPurchaseUsdcAmount("0"), 0n);
  assert.equal(parseOptionalInitialPurchaseUsdcAmount("0.000000"), 0n);
  assert.equal(parseOptionalInitialPurchaseUsdcAmount(""), null);
});

test("initial purchase parsing rejects excessive decimal places", () => {
  assert.throws(
    () => parseOptionalInitialPurchaseUsdcAmount("0.0000001"),
    /supports at most 6 decimal places/i
  );
});

test("slippage minimum output uses integer basis-point math", () => {
  assert.equal(calculateMinimumTokenOutput(1_000n, 100), 990n);
  assert.equal(calculateMinimumTokenOutput(1_000n, 50), 995n);
  assert.equal(calculateMinimumTokenOutput(1_001n, 200), 980n);
});

test("initial launch buy quote matches the source-backed constant-product reserve math", () => {
  const state = createInitialLaunchCurveState({
    virtualUsdcReserve: 5_000_000n,
    virtualTokenReserve: 1_000_000_000n * 10n ** 18n
  });

  const quote = quoteInitialLaunchBuy({
    state,
    usdcAmountIn: 2_500_000n,
    buyFeeBps: 100n,
    graduationThreshold: 10_000_000n
  });

  assert.equal(quote.fee, 25_000n);
  assert.equal(quote.netUsdcIn, 2_475_000n);
  assert.equal(quote.nextState.realUsdcReserve, 2_475_000n);
  assert.ok(quote.tokenAmountOut > 0n);
  assert.equal(quote.reachesGraduationThreshold, false);
});

test("initial launch buy quote rejects graduation-threshold overshoot", () => {
  const state = createInitialLaunchCurveState({
    virtualUsdcReserve: 5_000_000n,
    virtualTokenReserve: 1_000_000_000n * 10n ** 18n
  });

  assert.throws(
    () =>
      quoteInitialLaunchBuy({
        state,
        usdcAmountIn: 2_500_000n,
        buyFeeBps: 100n,
        graduationThreshold: 2_000_000n
      }),
    (error: unknown) => {
      assert.ok(error instanceof LaunchInitialBuyQuoteError);
      assert.equal(error.errorName, "GraduationThresholdExceeded");
      assert.deepEqual(error.args, [0n, 2_475_000n, 2_000_000n]);

      return true;
    }
  );
});
