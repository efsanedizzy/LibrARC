import assert from "node:assert/strict";
import test from "node:test";

import {
  activateTradeInput,
  applyPercentagePreset,
  DEFAULT_TRADE_PANEL_TAB,
  switchTradeMode
} from "./market-state";

test("market is the default trade-panel tab", () => {
  assert.equal(DEFAULT_TRADE_PANEL_TAB, "market");
});

test("sell input activation clears the buy side safely", () => {
  const next = activateTradeInput(
    {
      activeMode: "buy",
      buyInput: "12.5",
      sellInput: ""
    },
    "sell",
    "8"
  );

  assert.deepEqual(next, {
    activeMode: "sell",
    buyInput: "",
    sellInput: "8"
  });
});

test("buy input activation clears the sell side safely", () => {
  const next = activateTradeInput(
    {
      activeMode: "sell",
      buyInput: "",
      sellInput: "42"
    },
    "buy",
    "15"
  );

  assert.deepEqual(next, {
    activeMode: "buy",
    buyInput: "15",
    sellInput: ""
  });
});

test("zero-value input keeps the opposite side intact until a real trade amount is entered", () => {
  const next = activateTradeInput(
    {
      activeMode: "sell",
      buyInput: "",
      sellInput: "42"
    },
    "buy",
    "0"
  );

  assert.deepEqual(next, {
    activeMode: "buy",
    buyInput: "0",
    sellInput: "42"
  });
});

test("switching active trade mode never fabricates an amount conversion", () => {
  const next = switchTradeMode({
    activeMode: "buy",
    buyInput: "21.75",
    sellInput: ""
  });

  assert.deepEqual(next, {
    activeMode: "sell",
    buyInput: "",
    sellInput: ""
  });
});

test("percentage presets use bigint arithmetic for buy balances", () => {
  assert.equal(
    applyPercentagePreset({
      balance: 1_000_001n,
      decimals: 6,
      percent: 25
    }),
    "0.25"
  );
});

test("percentage presets use bigint arithmetic for sell balances", () => {
  assert.equal(
    applyPercentagePreset({
      balance: 500_000_000_000_000_000n,
      decimals: 18,
      percent: 50
    }),
    "0.25"
  );
});

test("100% percentage presets preserve the full bigint balance exactly", () => {
  assert.equal(
    applyPercentagePreset({
      balance: 987_654_321n,
      decimals: 6,
      percent: 100
    }),
    "987.654321"
  );
});
