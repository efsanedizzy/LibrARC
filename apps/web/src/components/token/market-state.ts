import { formatUnits } from "viem";

export type TradeMode = "buy" | "sell";
export type TradePanelTab = "market" | "limit" | "orders";

export const DEFAULT_TRADE_PANEL_TAB: TradePanelTab = "market";

export type MarketComposerState = {
  activeMode: TradeMode;
  buyInput: string;
  sellInput: string;
};

function hasNonZeroDecimal(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return false;
  }

  return normalized !== "0" && normalized !== "0." && normalized !== "0.0";
}

export function activateTradeInput(
  state: MarketComposerState,
  mode: TradeMode,
  nextValue: string
): MarketComposerState {
  if (mode === "buy") {
    return {
      activeMode: "buy",
      buyInput: nextValue,
      sellInput: hasNonZeroDecimal(nextValue) ? "" : state.sellInput
    };
  }

  return {
    activeMode: "sell",
    buyInput: hasNonZeroDecimal(nextValue) ? "" : state.buyInput,
    sellInput: nextValue
  };
}

export function switchTradeMode(state: MarketComposerState): MarketComposerState {
  return state.activeMode === "buy"
    ? {
        activeMode: "sell",
        buyInput: "",
        sellInput: state.sellInput
      }
    : {
        activeMode: "buy",
        buyInput: state.buyInput,
        sellInput: ""
      };
}

export function applyPercentagePreset({
  balance,
  decimals,
  percent
}: {
  balance: bigint;
  decimals: number;
  percent: 25 | 50 | 75 | 100;
}) {
  const scaledAmount = percent === 100 ? balance : (balance * BigInt(percent)) / 100n;

  return formatUnits(scaledAmount, decimals);
}
