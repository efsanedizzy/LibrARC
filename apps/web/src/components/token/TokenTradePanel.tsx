"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BaseError, useConnection, useSwitchChain, useWriteContract } from "wagmi";
import { formatUnits, type Address, getAddress } from "viem";

import { erc20Abi, launchPoolAbi } from "../../lib/arc/abis";
import { arcDeployment } from "../../lib/arc/config";
import { formatCompactAddress, formatTokenAmount, formatUsdcAmount } from "../../lib/arc/format";
import {
  buildArcTradeApiPath,
  isArcApproveSimulationSuccess,
  isArcBuyQuoteSuccess,
  isArcBuySimulationSuccess,
  isArcSellQuoteSuccess,
  isArcSellSimulationSuccess,
  isArcTradeApiError,
  type ArcBuyQuoteSuccess,
  type ArcSellQuoteSuccess,
  type ArcTradeApiError
} from "../../lib/arc/trade-api";
import {
  buildExplorerTransactionUrl,
  calculateMinimumOutput,
  DEFAULT_SLIPPAGE_BPS,
  formatSlippageBps,
  getFreshDeadlineSeconds,
  isWalletRejection,
  parseDecimalAmount,
  parseSlippagePercentToBps,
  shortenHash,
  SLIPPAGE_PRESET_BPS,
  waitForWalletTransactionReceipt
} from "../../lib/arc/trading";
import { arcTestnet } from "../../lib/chains/arc-testnet";
import { type ArcTokenApiSuccess } from "../../lib/arc/token-api";
import { Button } from "../ui/Button";
import { WalletConnectButton } from "../wallet/WalletConnectButton";

type TokenTradePanelProps = {
  data: ArcTokenApiSuccess | null;
  isPageLoading: boolean;
  onRefresh: () => void;
  tokenAddress: Address;
};

type TradeMode = "buy" | "sell";

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: ArcBuyQuoteSuccess | ArcSellQuoteSuccess }
  | { status: "error"; error: ArcTradeApiError };

type TradePhase =
  | "disconnected"
  | "wrong chain"
  | "idle"
  | "quoting"
  | "approval required"
  | "approving"
  | "approval confirmed"
  | "simulating"
  | "wallet confirmation"
  | "transaction pending"
  | "success"
  | "rejected by user"
  | "reverted"
  | "rpc unavailable";

type TradeFeedback = {
  details?: Array<{ label: string; message: string }>;
  message: string;
  mode: TradeMode;
  phase: TradePhase;
  txHash?: `0x${string}`;
};

type JsonRequestOptions = {
  method?: "POST";
  signal?: AbortSignal;
};

const TERMINAL_PHASES = new Set<TradePhase>([
  "success",
  "rejected by user",
  "reverted",
  "rpc unavailable"
]);

function formatWalletError(error: unknown, fallback: string) {
  if (!error) {
    return fallback;
  }

  const baseMessage =
    error instanceof BaseError
      ? error.shortMessage
      : error instanceof Error
        ? error.message
        : fallback;
  const normalized = baseMessage.toLowerCase();

  if (isWalletRejection(error)) {
    return "Request rejected in your wallet.";
  }

  if (
    normalized.includes("provider not found") ||
    normalized.includes("connector not found") ||
    normalized.includes("wallet provider")
  ) {
    return "The connected browser wallet is unavailable right now.";
  }

  if (normalized.includes("chain mismatch")) {
    return "Switch your wallet to Arc Testnet before continuing.";
  }

  return baseMessage || fallback;
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  { method = "POST", signal }: JsonRequestOptions = {}
) {
  const response = await fetch(url, {
    method,
    body: JSON.stringify(body),
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    signal
  });
  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    if (isArcTradeApiError(payload)) {
      throw payload;
    }

    throw {
      ok: false,
      code: "RPC_UNAVAILABLE",
      message: `The route returned HTTP ${response.status}.`,
      details: [
        {
          label: url,
          message: `The route returned HTTP ${response.status}.`
        }
      ]
    } satisfies ArcTradeApiError;
  }

  return payload as T;
}

function formatAllowance(value: bigint, decimals: number, symbol: string) {
  return `${formatTokenAmount(value, decimals)} ${symbol}`;
}

function formatPhaseLabel(phase: TradePhase) {
  switch (phase) {
    case "approval required":
      return "Approval required";
    case "approval confirmed":
      return "Approval confirmed";
    case "wallet confirmation":
      return "Confirm in wallet";
    case "transaction pending":
      return "Transaction pending";
    case "rejected by user":
      return "Wallet rejection";
    case "rpc unavailable":
      return "RPC unavailable";
    default:
      return phase.charAt(0).toUpperCase() + phase.slice(1);
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function TradeStatusPill({
  label,
  tone
}: {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  const className =
    tone === "success"
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
        : tone === "danger"
          ? "border-rose-300/20 bg-rose-300/10 text-rose-100"
          : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100";

  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]",
        className
      ].join(" ")}
    >
      {label}
    </span>
  );
}

function FeedbackCard({
  feedback,
  onDismiss,
  onStartAnotherTrade
}: {
  feedback: TradeFeedback | null;
  onDismiss: () => void;
  onStartAnotherTrade: () => void;
}) {
  if (!feedback) {
    return null;
  }

  const tone =
    feedback.phase === "success"
      ? "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
      : feedback.phase === "approval confirmed"
        ? "border-cyan-300/18 bg-cyan-300/8 text-cyan-50"
        : feedback.phase === "rejected by user"
          ? "border-amber-300/18 bg-amber-300/8 text-amber-50"
          : "border-rose-300/18 bg-rose-300/8 text-rose-50";
  const heading =
    feedback.phase === "success"
      ? "Trade confirmed"
      : feedback.phase === "rejected by user"
        ? "Wallet request rejected"
        : feedback.phase === "rpc unavailable"
          ? "RPC unavailable"
          : feedback.phase === "approval confirmed"
            ? "Approval confirmed"
            : "Trade update";

  const receivedDetail = feedback.details?.find((detail) =>
    detail.label.toLowerCase().includes("received")
  );
  const receivedAmount = receivedDetail?.message;

  return (
    <div
      aria-live="polite"
      className={`space-y-4 rounded-[var(--radius-lg)] border px-4 py-4 sm:px-5 ${tone}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <TradeStatusPill
          label={formatPhaseLabel(feedback.phase)}
          tone={
            feedback.phase === "success"
              ? "success"
              : feedback.phase === "rejected by user"
                ? "warning"
                : feedback.phase === "approval confirmed"
                  ? "neutral"
                  : "danger"
          }
        />
        {feedback.txHash ? (
          <Link
            className="text-sm font-semibold text-cyan-100 transition hover:text-white"
            href={buildExplorerTransactionUrl(arcDeployment.explorerUrl, feedback.txHash)}
            rel="noreferrer"
            target="_blank"
          >
            {shortenHash(feedback.txHash)}
          </Link>
        ) : null}
      </div>

      <div>
        <h3 className="text-base font-semibold text-white">{heading}</h3>
        <p className="mt-2 text-sm leading-6">{feedback.message}</p>
      </div>

      {feedback.phase === "success" && feedback.txHash ? (
        <div className="surface-muted rounded-[var(--radius-md)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Confirmed receipt
          </p>
          <div className="mt-3 space-y-2 text-sm text-white">
            <p>Transaction hash: {shortenHash(feedback.txHash)}</p>
            {receivedAmount ? <p>Received: {receivedAmount}</p> : null}
            <p>Balances and pool state refresh after confirmation.</p>
          </div>
        </div>
      ) : null}

      {feedback.details && feedback.details.length > 0 ? (
        <details className="surface-muted rounded-[var(--radius-md)] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white">
            Technical details
          </summary>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
            {feedback.details.map((detail) => (
              <li key={`${detail.label}-${detail.message}`}>
                <span className="font-semibold text-white">{detail.label}:</span> {detail.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {feedback.phase === "success" ? (
        <div className="flex flex-wrap gap-3">
          <Button onClick={onDismiss} size="sm" variant="secondary">
            Dismiss
          </Button>
          <Button onClick={onStartAnotherTrade} size="sm" variant="ghost">
            Start another trade
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function getFeedbackFromTradeError(
  error: ArcTradeApiError,
  mode: TradeMode,
  fallback: string
): TradeFeedback {
  return {
    mode,
    phase: error.code === "RPC_UNAVAILABLE" ? "rpc unavailable" : "reverted",
    message: error.revert?.reason || error.revert?.message || error.message || fallback,
    details: [
      ...error.details,
      ...(error.revert
        ? [
            {
              label: error.revert.errorName ?? error.revert.signature ?? "Revert",
              message: error.revert.message
            }
          ]
        : [])
    ]
  };
}

function getActionButtonLabel({
  activeMode,
  approvalRequired,
  disabledReason,
  feedback,
  isConnected,
  isPageLoading,
  isWrongChain,
  quoteState,
  tradeData
}: {
  activeMode: TradeMode;
  approvalRequired: boolean;
  disabledReason: string | null;
  feedback: TradeFeedback | null;
  isConnected: boolean;
  isPageLoading: boolean;
  isWrongChain: boolean;
  quoteState: QuoteState;
  tradeData: ArcTokenApiSuccess | null;
}) {
  if (!isConnected) {
    return "Connect wallet";
  }

  if (isWrongChain) {
    return "Switch to Arc Testnet";
  }

  if (!tradeData || isPageLoading) {
    return "Loading token data";
  }

  if (
    feedback?.mode === activeMode &&
    (feedback.phase === "wallet confirmation" || feedback.phase === "quoting")
  ) {
    return "Confirm in wallet";
  }

  if (feedback?.mode === activeMode && feedback.phase === "transaction pending") {
    return "Transaction pending";
  }

  if (feedback?.mode === activeMode && feedback.phase === "approving") {
    return "Approving exact amount...";
  }

  if (feedback?.mode === activeMode && feedback.phase === "approval confirmed") {
    return "Approval confirmed";
  }

  if (quoteState.status === "loading") {
    return "Getting quote";
  }

  if (approvalRequired) {
    return "Approval required";
  }

  if (disabledReason === "Enter a USDC amount." || disabledReason?.startsWith("Enter a ")) {
    return "Enter an amount";
  }

  if (disabledReason?.includes("unavailable") || disabledReason?.includes("Active")) {
    return "Trading unavailable";
  }

  return activeMode === "buy" ? "Buy tokens" : "Sell tokens";
}

function getApprovalSummary({
  activeMode,
  approvalRequired,
  feedback,
  tokenSymbol
}: {
  activeMode: TradeMode;
  approvalRequired: boolean;
  feedback: TradeFeedback | null;
  tokenSymbol: string;
}) {
  if (feedback?.mode === activeMode && feedback.phase === "approving") {
    return "Approving exact amount...";
  }

  if (feedback?.mode === activeMode && feedback.phase === "approval confirmed") {
    return "Approval confirmed";
  }

  if (approvalRequired) {
    return "Approval required";
  }

  return activeMode === "buy" ? "Ready to buy" : `Ready to sell ${tokenSymbol}`;
}

export function TokenTradePanel({
  data,
  isPageLoading,
  onRefresh,
  tokenAddress
}: TokenTradePanelProps) {
  const connection = useConnection();
  const { mutateAsync: switchChainAsync, isPending: isSwitchPending } = useSwitchChain();
  const { mutateAsync: writeContractAsync, isPending: isWritePending } = useWriteContract();
  const [activeMode, setActiveMode] = useState<TradeMode>("buy");
  const [buyInput, setBuyInput] = useState("");
  const [sellInput, setSellInput] = useState("");
  const [slippageMode, setSlippageMode] = useState<"preset" | "custom">("preset");
  const [presetSlippageBps, setPresetSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [customSlippageInput, setCustomSlippageInput] = useState("1.00");
  const [buyQuoteState, setBuyQuoteState] = useState<QuoteState>({ status: "idle" });
  const [sellQuoteState, setSellQuoteState] = useState<QuoteState>({ status: "idle" });
  const [feedback, setFeedback] = useState<TradeFeedback | null>(null);

  const walletAddress = connection.address ? getAddress(connection.address) : undefined;
  const isConnected = connection.isConnected && Boolean(walletAddress);
  const isWrongChain = isConnected && connection.chainId !== arcTestnet.id;
  const tradeData = data;
  const poolAddress = tradeData?.pool.address;
  const tokenDecimals = tradeData?.token.decimals ?? 18;
  const tokenSymbol = tradeData?.token.symbol ?? "TOKEN";
  const buyBalance = tradeData?.wallet?.usdcBalance ? BigInt(tradeData.wallet.usdcBalance) : 0n;
  const sellBalance = tradeData?.wallet?.tokenBalance ? BigInt(tradeData.wallet.tokenBalance) : 0n;
  const usdcAllowance = tradeData?.wallet?.usdcAllowanceToPool
    ? BigInt(tradeData.wallet.usdcAllowanceToPool)
    : 0n;
  const tokenAllowance = tradeData?.wallet?.tokenAllowanceToPool
    ? BigInt(tradeData.wallet.tokenAllowanceToPool)
    : 0n;

  const parsedCustomSlippage = useMemo(() => {
    try {
      return parseSlippagePercentToBps(customSlippageInput);
    } catch {
      return null;
    }
  }, [customSlippageInput]);

  const effectiveSlippageBps = slippageMode === "custom" ? parsedCustomSlippage : presetSlippageBps;

  const buyAmount = useMemo(() => {
    try {
      return buyInput.trim() ? parseDecimalAmount(buyInput, 6, "USDC amount") : null;
    } catch {
      return null;
    }
  }, [buyInput]);

  const sellAmount = useMemo(() => {
    try {
      return sellInput.trim()
        ? parseDecimalAmount(sellInput, tokenDecimals, `${tokenSymbol} amount`)
        : null;
    } catch {
      return null;
    }
  }, [sellInput, tokenDecimals, tokenSymbol]);

  const buyApprovalRequired = Boolean(buyAmount && usdcAllowance < buyAmount);
  const sellApprovalRequired = Boolean(sellAmount && tokenAllowance < sellAmount);
  const quoteState = activeMode === "buy" ? buyQuoteState : sellQuoteState;
  const selectedBuyQuote =
    buyQuoteState.status === "ready" && isArcBuyQuoteSuccess(buyQuoteState.data)
      ? buyQuoteState.data
      : null;
  const selectedSellQuote =
    sellQuoteState.status === "ready" && isArcSellQuoteSuccess(sellQuoteState.data)
      ? sellQuoteState.data
      : null;
  const buyMinimumReceived =
    selectedBuyQuote && effectiveSlippageBps !== null
      ? calculateMinimumOutput(BigInt(selectedBuyQuote.quote.tokenAmountOut), effectiveSlippageBps)
      : null;
  const sellMinimumReceived =
    selectedSellQuote && effectiveSlippageBps !== null
      ? calculateMinimumOutput(
          BigInt(selectedSellQuote.quote.netUsdcAmountOut),
          effectiveSlippageBps
        )
      : null;

  useEffect(() => {
    if (feedback && TERMINAL_PHASES.has(feedback.phase) && feedback.phase !== "success") {
      setFeedback(null);
    }
  }, [
    activeMode,
    buyInput,
    customSlippageInput,
    feedback,
    sellInput,
    slippageMode,
    presetSlippageBps
  ]);

  useEffect(() => {
    if (!tradeData || !walletAddress) {
      setBuyQuoteState({ status: "idle" });
      return;
    }

    if (!buyInput.trim()) {
      setBuyQuoteState({ status: "idle" });
      return;
    }

    if (!buyAmount) {
      setBuyQuoteState({
        status: "error",
        error: {
          ok: false,
          code: "INVALID_AMOUNT",
          message: "Enter a valid USDC amount with at most 6 decimal places.",
          details: [
            {
              label: "USDC amount",
              message: "Enter a valid USDC amount with at most 6 decimal places."
            }
          ]
        }
      });
      return;
    }

    const abortController = new AbortController();
    setBuyQuoteState({ status: "loading" });

    void postJson(
      buildArcTradeApiPath(tokenAddress, "quote-buy"),
      { walletAddress, usdcAmount: buyInput },
      { signal: abortController.signal }
    )
      .then((payload) => {
        if (!isArcBuyQuoteSuccess(payload)) {
          throw {
            ok: false,
            code: "RPC_UNAVAILABLE",
            message: "Unexpected buy quote response.",
            details: [{ label: "quote-buy", message: "Unexpected buy quote response." }]
          } satisfies ArcTradeApiError;
        }

        setBuyQuoteState({ status: "ready", data: payload });
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        setBuyQuoteState({
          status: "error",
          error: isArcTradeApiError(error)
            ? error
            : {
                ok: false,
                code: "RPC_UNAVAILABLE",
                message: error instanceof Error ? error.message : "Buy quote failed.",
                details: [
                  {
                    label: "quote-buy",
                    message: error instanceof Error ? error.message : "Buy quote failed."
                  }
                ]
              }
        });
      });

    return () => {
      abortController.abort();
    };
  }, [buyAmount, buyInput, tokenAddress, tradeData, walletAddress]);

  useEffect(() => {
    if (!tradeData || !walletAddress) {
      setSellQuoteState({ status: "idle" });
      return;
    }

    if (!sellInput.trim()) {
      setSellQuoteState({ status: "idle" });
      return;
    }

    if (!sellAmount) {
      setSellQuoteState({
        status: "error",
        error: {
          ok: false,
          code: "INVALID_AMOUNT",
          message: `Enter a valid ${tokenSymbol} amount with at most ${tokenDecimals} decimal places.`,
          details: [
            {
              label: `${tokenSymbol} amount`,
              message: `Enter a valid ${tokenSymbol} amount with at most ${tokenDecimals} decimal places.`
            }
          ]
        }
      });
      return;
    }

    const abortController = new AbortController();
    setSellQuoteState({ status: "loading" });

    void postJson(
      buildArcTradeApiPath(tokenAddress, "quote-sell"),
      { walletAddress, tokenAmount: sellInput },
      { signal: abortController.signal }
    )
      .then((payload) => {
        if (!isArcSellQuoteSuccess(payload)) {
          throw {
            ok: false,
            code: "RPC_UNAVAILABLE",
            message: "Unexpected sell quote response.",
            details: [{ label: "quote-sell", message: "Unexpected sell quote response." }]
          } satisfies ArcTradeApiError;
        }

        setSellQuoteState({ status: "ready", data: payload });
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        setSellQuoteState({
          status: "error",
          error: isArcTradeApiError(error)
            ? error
            : {
                ok: false,
                code: "RPC_UNAVAILABLE",
                message: error instanceof Error ? error.message : "Sell quote failed.",
                details: [
                  {
                    label: "quote-sell",
                    message: error instanceof Error ? error.message : "Sell quote failed."
                  }
                ]
              }
        });
      });

    return () => {
      abortController.abort();
    };
  }, [sellAmount, sellInput, tokenAddress, tokenDecimals, tokenSymbol, tradeData, walletAddress]);

  async function handleSwitchNetwork() {
    await switchChainAsync({
      chainId: arcTestnet.id,
      addEthereumChainParameter: {
        blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
        chainName: arcTestnet.name,
        nativeCurrency: arcTestnet.nativeCurrency,
        rpcUrls: arcTestnet.rpcUrls.default.http
      }
    });
  }

  async function getInjectedProvider() {
    const provider = (await connection.connector?.getProvider({
      chainId: arcTestnet.id
    })) as { request?: unknown } | undefined;

    if (!provider || typeof provider.request !== "function") {
      throw new Error("The connected browser wallet provider is unavailable.");
    }

    return provider as {
      request(args: { method: string; params?: unknown[] }): Promise<unknown>;
    };
  }

  function getBuyDisabledReason() {
    if (!tradeData) return "Token data is still loading.";
    if (!isConnected) return "Connect your wallet to buy.";
    if (isWrongChain) return "Switch to Arc Testnet to buy.";
    if (!tradeData.pool.canBuy) return "Buying is currently unavailable for this pool.";
    if (tradeData.pool.statusLabel !== "Active") return "The pool must be Active to buy.";
    if (!buyInput.trim()) return "Enter a USDC amount.";
    if (!buyAmount) return "Enter a valid USDC amount.";
    if (buyAmount > buyBalance) return "USDC balance is too low for this buy.";
    if (buyQuoteState.status === "loading") return "Refreshing the latest buy quote.";
    if (buyQuoteState.status === "error") return buyQuoteState.error.message;
    if (!selectedBuyQuote) return "A buy quote is required before trading.";
    if (BigInt(selectedBuyQuote.quote.tokenAmountOut) === 0n)
      return "This buy would return zero tokens.";
    if (effectiveSlippageBps === null) return "Enter a valid slippage value.";
    if (feedback && !TERMINAL_PHASES.has(feedback.phase))
      return "A transaction is already in progress.";

    return null;
  }

  function getSellDisabledReason() {
    if (!tradeData) return "Token data is still loading.";
    if (!isConnected) return "Connect your wallet to sell.";
    if (isWrongChain) return "Switch to Arc Testnet to sell.";
    if (!tradeData.pool.canSell) return "Selling is currently unavailable for this pool.";
    if (tradeData.pool.statusLabel !== "Active") return "The pool must be Active to sell.";
    if (!sellInput.trim()) return `Enter a ${tokenSymbol} amount.`;
    if (!sellAmount) return `Enter a valid ${tokenSymbol} amount.`;
    if (sellAmount > sellBalance) return `${tokenSymbol} balance is too low for this sell.`;
    if (sellQuoteState.status === "loading") return "Refreshing the latest sell quote.";
    if (sellQuoteState.status === "error") return sellQuoteState.error.message;
    if (!selectedSellQuote) return "A sell quote is required before trading.";
    if (BigInt(selectedSellQuote.quote.netUsdcAmountOut) === 0n)
      return "This sell would return zero USDC.";
    if (effectiveSlippageBps === null) return "Enter a valid slippage value.";
    if (feedback && !TERMINAL_PHASES.has(feedback.phase))
      return "A transaction is already in progress.";

    return null;
  }

  async function handleApprove(asset: "token" | "usdc", amount: bigint, mode: TradeMode) {
    if (!walletAddress || !poolAddress) {
      throw new Error("Wallet address or pool address is unavailable.");
    }

    const simulation = await postJson(buildArcTradeApiPath(tokenAddress, "simulate-approve"), {
      asset,
      amount: amount.toString(10),
      walletAddress
    });

    if (!isArcApproveSimulationSuccess(simulation)) {
      throw simulation;
    }

    const approvalAssetAddress = asset === "usdc" ? arcDeployment.usdcAddress : tokenAddress;
    const provider = await getInjectedProvider();

    setFeedback({
      mode,
      phase: "wallet confirmation",
      message: `Confirm the exact ${asset.toUpperCase()} approval in your wallet.`,
      details: [
        { label: "Spender", message: poolAddress },
        { label: "Amount", message: amount.toString(10) }
      ]
    });

    const approvalHash = (await writeContractAsync({
      abi: erc20Abi,
      address: approvalAssetAddress,
      args: [poolAddress, amount],
      chainId: arcTestnet.id,
      functionName: "approve"
    })) as `0x${string}`;

    setFeedback({
      mode,
      phase: "approving",
      message: "Waiting for the approval receipt from your wallet provider.",
      txHash: approvalHash
    });

    const approvalReceipt = await waitForWalletTransactionReceipt(provider, approvalHash);

    if (approvalReceipt.status !== "0x1") {
      throw new Error("The approval transaction reverted on-chain.");
    }

    setFeedback({
      mode,
      phase: "approval confirmed",
      message: "Approval confirmed. Refreshing allowances and requesting a fresh quote.",
      txHash: approvalHash
    });

    onRefresh();
  }

  async function handleExecuteBuy() {
    if (!tradeData || !walletAddress || !buyAmount || effectiveSlippageBps === null) {
      return;
    }

    const disabledReason = getBuyDisabledReason();

    if (disabledReason) {
      setFeedback({ mode: "buy", phase: "reverted", message: disabledReason });
      return;
    }

    try {
      setFeedback({
        mode: "buy",
        phase: "quoting",
        message: "Fetching a fresh buy quote from the Arc token route."
      });

      let quote = await postJson(buildArcTradeApiPath(tokenAddress, "quote-buy"), {
        walletAddress,
        usdcAmount: buyInput
      });

      if (!isArcBuyQuoteSuccess(quote)) {
        throw quote;
      }

      let minimumTokenAmountOut = calculateMinimumOutput(
        BigInt(quote.quote.tokenAmountOut),
        effectiveSlippageBps
      );

      if (buyApprovalRequired) {
        setFeedback({
          mode: "buy",
          phase: "approval required",
          message: "An exact Arc USDC approval is required before the buy can execute."
        });
        await handleApprove("usdc", buyAmount, "buy");

        setFeedback({
          mode: "buy",
          phase: "quoting",
          message: "Requesting a fresh buy quote after approval confirmation."
        });

        quote = await postJson(buildArcTradeApiPath(tokenAddress, "quote-buy"), {
          walletAddress,
          usdcAmount: buyInput
        });

        if (!isArcBuyQuoteSuccess(quote)) {
          throw quote;
        }

        minimumTokenAmountOut = calculateMinimumOutput(
          BigInt(quote.quote.tokenAmountOut),
          effectiveSlippageBps
        );
      }

      const deadline = getFreshDeadlineSeconds();

      setFeedback({
        mode: "buy",
        phase: "simulating",
        message: "Simulating the exact LaunchPool buy before opening the wallet confirmation."
      });

      const simulation = await postJson(buildArcTradeApiPath(tokenAddress, "simulate-buy"), {
        walletAddress,
        usdcAmountIn: buyAmount.toString(10),
        minTokenAmountOut: minimumTokenAmountOut.toString(10),
        deadline: deadline.toString(10)
      });

      if (!isArcBuySimulationSuccess(simulation)) {
        throw simulation;
      }

      const provider = await getInjectedProvider();

      setFeedback({
        mode: "buy",
        phase: "wallet confirmation",
        message: "Confirm the Arc Testnet buy in your browser wallet."
      });

      const hash = (await writeContractAsync({
        abi: launchPoolAbi,
        address: tradeData.pool.address,
        args: [buyAmount, minimumTokenAmountOut, deadline, walletAddress],
        chainId: arcTestnet.id,
        functionName: "buy"
      })) as `0x${string}`;

      setFeedback({
        mode: "buy",
        phase: "transaction pending",
        message: "Buy submitted. Waiting for the Arc Testnet receipt in your wallet provider.",
        txHash: hash,
        details: [
          {
            label: "Expected received amount",
            message: formatTokenAmount(BigInt(simulation.tokenAmountOut), tokenDecimals)
          }
        ]
      });

      const receipt = await waitForWalletTransactionReceipt(provider, hash);

      if (receipt.status !== "0x1") {
        throw new Error("The buy transaction reverted on-chain.");
      }

      setFeedback({
        mode: "buy",
        phase: "success",
        message:
          "Buy confirmed. Refreshing balances, allowances, reserves, and graduation progress.",
        txHash: hash,
        details: [
          {
            label: "Received amount",
            message: formatTokenAmount(BigInt(simulation.tokenAmountOut), tokenDecimals)
          }
        ]
      });
      onRefresh();
    } catch (error) {
      if (isArcTradeApiError(error)) {
        setFeedback(getFeedbackFromTradeError(error, "buy", "Buy failed."));
        return;
      }

      setFeedback({
        mode: "buy",
        phase: isWalletRejection(error) ? "rejected by user" : "reverted",
        message: formatWalletError(error, "Buy failed.")
      });
    }
  }

  async function handleExecuteSell() {
    if (!tradeData || !walletAddress || !sellAmount || effectiveSlippageBps === null) {
      return;
    }

    const disabledReason = getSellDisabledReason();

    if (disabledReason) {
      setFeedback({ mode: "sell", phase: "reverted", message: disabledReason });
      return;
    }

    try {
      setFeedback({
        mode: "sell",
        phase: "quoting",
        message: "Fetching a fresh sell quote from the Arc token route."
      });

      let quote = await postJson(buildArcTradeApiPath(tokenAddress, "quote-sell"), {
        walletAddress,
        tokenAmount: sellInput
      });

      if (!isArcSellQuoteSuccess(quote)) {
        throw quote;
      }

      let minimumUsdcAmountOut = calculateMinimumOutput(
        BigInt(quote.quote.netUsdcAmountOut),
        effectiveSlippageBps
      );

      if (sellApprovalRequired) {
        setFeedback({
          mode: "sell",
          phase: "approval required",
          message: `An exact ${tokenSymbol} approval is required before the sell can execute.`
        });
        await handleApprove("token", sellAmount, "sell");

        setFeedback({
          mode: "sell",
          phase: "quoting",
          message: "Requesting a fresh sell quote after approval confirmation."
        });

        quote = await postJson(buildArcTradeApiPath(tokenAddress, "quote-sell"), {
          walletAddress,
          tokenAmount: sellInput
        });

        if (!isArcSellQuoteSuccess(quote)) {
          throw quote;
        }

        minimumUsdcAmountOut = calculateMinimumOutput(
          BigInt(quote.quote.netUsdcAmountOut),
          effectiveSlippageBps
        );
      }

      const deadline = getFreshDeadlineSeconds();

      setFeedback({
        mode: "sell",
        phase: "simulating",
        message: "Simulating the exact LaunchPool sell before opening the wallet confirmation."
      });

      const simulation = await postJson(buildArcTradeApiPath(tokenAddress, "simulate-sell"), {
        walletAddress,
        tokenAmountIn: sellAmount.toString(10),
        minUsdcAmountOut: minimumUsdcAmountOut.toString(10),
        deadline: deadline.toString(10)
      });

      if (!isArcSellSimulationSuccess(simulation)) {
        throw simulation;
      }

      const provider = await getInjectedProvider();

      setFeedback({
        mode: "sell",
        phase: "wallet confirmation",
        message: "Confirm the Arc Testnet sell in your browser wallet."
      });

      const hash = (await writeContractAsync({
        abi: launchPoolAbi,
        address: tradeData.pool.address,
        args: [sellAmount, minimumUsdcAmountOut, deadline, walletAddress],
        chainId: arcTestnet.id,
        functionName: "sell"
      })) as `0x${string}`;

      setFeedback({
        mode: "sell",
        phase: "transaction pending",
        message: "Sell submitted. Waiting for the Arc Testnet receipt in your wallet provider.",
        txHash: hash,
        details: [
          {
            label: "Expected received amount",
            message: `${formatUsdcAmount(BigInt(simulation.netUsdcAmountOut))} USDC`
          }
        ]
      });

      const receipt = await waitForWalletTransactionReceipt(provider, hash);

      if (receipt.status !== "0x1") {
        throw new Error("The sell transaction reverted on-chain.");
      }

      setFeedback({
        mode: "sell",
        phase: "success",
        message: "Sell confirmed. Refreshing balances, allowances, reserves, and curve state.",
        txHash: hash,
        details: [
          {
            label: "Received amount",
            message: `${formatUsdcAmount(BigInt(simulation.netUsdcAmountOut))} USDC`
          }
        ]
      });
      onRefresh();
    } catch (error) {
      if (isArcTradeApiError(error)) {
        setFeedback(getFeedbackFromTradeError(error, "sell", "Sell failed."));
        return;
      }

      setFeedback({
        mode: "sell",
        phase: isWalletRejection(error) ? "rejected by user" : "reverted",
        message: formatWalletError(error, "Sell failed.")
      });
    }
  }

  const buyDisabledReason = getBuyDisabledReason();
  const sellDisabledReason = getSellDisabledReason();
  const activeDisabledReason = activeMode === "buy" ? buyDisabledReason : sellDisabledReason;
  const activeApprovalRequired = activeMode === "buy" ? buyApprovalRequired : sellApprovalRequired;
  const activeQuote = activeMode === "buy" ? selectedBuyQuote : selectedSellQuote;
  const actionButtonLabel = getActionButtonLabel({
    activeMode,
    approvalRequired: activeApprovalRequired,
    disabledReason: activeDisabledReason,
    feedback,
    isConnected,
    isPageLoading,
    isWrongChain,
    quoteState,
    tradeData
  });
  const approvalSummary = getApprovalSummary({
    activeMode,
    approvalRequired: activeApprovalRequired,
    feedback,
    tokenSymbol
  });

  function handleResetTradeState() {
    setFeedback(null);
  }

  function handleStartAnotherTrade() {
    setFeedback(null);
    if (activeMode === "buy") {
      setBuyInput("");
      setBuyQuoteState({ status: "idle" });
    } else {
      setSellInput("");
      setSellQuoteState({ status: "idle" });
    }
  }

  function handleSetMax() {
    if (activeMode === "buy") {
      setBuyInput(formatUnits(buyBalance, 6));
      return;
    }

    setSellInput(formatUnits(sellBalance, tokenDecimals));
  }

  return (
    <aside className="surface-panel rounded-[var(--radius-xl)] p-5 sm:p-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Trade</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
              Buy or sell on Arc
            </h2>
          </div>
          <TradeStatusPill
            label={approvalSummary}
            tone={
              approvalSummary === "Approval confirmed"
                ? "neutral"
                : approvalSummary === "Approval required"
                  ? "warning"
                  : "success"
            }
          />
        </div>
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          Arc Testnet only - test assets have no monetary value.
        </p>
      </div>

      <div className="surface-muted mt-6 rounded-full p-1" role="tablist" aria-label="Trade mode">
        <button
          aria-selected={activeMode === "buy"}
          className={[
            "min-h-11 flex-1 rounded-full px-4 py-2 text-sm font-semibold transition",
            activeMode === "buy"
              ? "bg-[rgba(94,234,212,0.12)] text-white"
              : "text-[var(--text-muted)] hover:text-white"
          ].join(" ")}
          onClick={() => setActiveMode("buy")}
          role="tab"
          type="button"
        >
          Buy
        </button>
        <button
          aria-selected={activeMode === "sell"}
          className={[
            "min-h-11 flex-1 rounded-full px-4 py-2 text-sm font-semibold transition",
            activeMode === "sell"
              ? "bg-[rgba(94,234,212,0.12)] text-white"
              : "text-[var(--text-muted)] hover:text-white"
          ].join(" ")}
          onClick={() => setActiveMode("sell")}
          role="tab"
          type="button"
        >
          Sell
        </button>
      </div>

      {isPageLoading && !tradeData ? (
        <div className="mt-6 animate-pulse space-y-4">
          <div className="h-20 rounded-[var(--radius-md)] bg-white/6" />
          <div className="h-28 rounded-[var(--radius-md)] bg-white/6" />
          <div className="h-44 rounded-[var(--radius-md)] bg-white/6" />
        </div>
      ) : null}

      {tradeData ? (
        <div className="mt-6 space-y-5">
          <div className="surface-muted rounded-[var(--radius-lg)] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-4">
              <label
                className="text-sm font-semibold text-white"
                htmlFor={activeMode === "buy" ? "buy-usdc-input" : "sell-token-input"}
              >
                {activeMode === "buy" ? "USDC input" : `${tokenSymbol} input`}
              </label>
              <button
                className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-secondary)] transition hover:border-cyan-300/30 hover:text-white"
                disabled={activeMode === "buy" ? buyBalance === 0n : sellBalance === 0n}
                onClick={handleSetMax}
                type="button"
              >
                Max
              </button>
            </div>

            <div className="mt-4">
              <div className="field-shell min-h-[4.25rem] justify-between gap-3 rounded-[var(--radius-lg)] px-4">
                <input
                  className="min-w-0 flex-1 bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-[var(--text-faint)]"
                  disabled={Boolean(feedback && !TERMINAL_PHASES.has(feedback.phase))}
                  id={activeMode === "buy" ? "buy-usdc-input" : "sell-token-input"}
                  inputMode="decimal"
                  onChange={(event) =>
                    activeMode === "buy"
                      ? setBuyInput(event.target.value)
                      : setSellInput(event.target.value)
                  }
                  placeholder="0.00"
                  value={activeMode === "buy" ? buyInput : sellInput}
                />
                <div className="text-right">
                  <p className="text-sm font-medium text-white">
                    {activeMode === "buy" ? "USDC" : tokenSymbol}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.22em] text-[var(--text-faint)]">
                    {activeMode === "buy" ? "6 decimals" : `${tokenDecimals} decimals`}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-md)] border border-white/10 bg-[rgba(4,8,20,0.65)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-faint)]">
                  {activeMode === "buy" ? "Wallet USDC balance" : `Wallet ${tokenSymbol} balance`}
                </p>
                <p className="mt-2 text-base font-semibold text-white tabular-nums">
                  {activeMode === "buy"
                    ? `${formatUsdcAmount(buyBalance)} USDC`
                    : formatTokenAmount(sellBalance, tokenDecimals)}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-white/10 bg-[rgba(4,8,20,0.65)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-faint)]">
                  {activeMode === "buy" ? "Allowance to pool" : `${tokenSymbol} allowance`}
                </p>
                <p className="mt-2 text-base font-semibold text-white tabular-nums">
                  {activeMode === "buy"
                    ? formatAllowance(usdcAllowance, 6, "USDC")
                    : formatAllowance(tokenAllowance, tokenDecimals, tokenSymbol)}
                </p>
                <p
                  className="mt-2 truncate text-xs leading-5 text-[var(--text-faint)]"
                  title={poolAddress}
                >
                  Spender: {poolAddress ? formatCompactAddress(poolAddress) : "Unavailable"}
                </p>
              </div>
            </div>
          </div>

          <div className="surface-muted rounded-[var(--radius-lg)] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Slippage</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-faint)]">
                  Allowed range: 0.10% to 5.00%.
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-white">
                {effectiveSlippageBps !== null
                  ? formatSlippageBps(effectiveSlippageBps)
                  : "Invalid"}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {SLIPPAGE_PRESET_BPS.map((preset) => (
                <button
                  className={[
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    slippageMode === "preset" && presetSlippageBps === preset
                      ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                      : "border-white/10 text-[var(--text-secondary)] hover:border-cyan-300/25 hover:text-white"
                  ].join(" ")}
                  key={preset}
                  onClick={() => {
                    setSlippageMode("preset");
                    setPresetSlippageBps(preset);
                    setCustomSlippageInput((preset / 100).toFixed(2));
                  }}
                  type="button"
                >
                  {formatSlippageBps(preset)}
                </button>
              ))}
            </div>

            <div className="mt-4">
              <label
                className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-faint)]"
                htmlFor="custom-slippage-input"
              >
                Custom slippage
              </label>
              <div className="mt-2 flex items-center gap-3">
                <input
                  className="field-shell min-h-11 flex-1 text-sm"
                  id="custom-slippage-input"
                  inputMode="decimal"
                  max="5"
                  min="0.1"
                  onChange={(event) => {
                    setSlippageMode("custom");
                    setCustomSlippageInput(event.target.value);
                  }}
                  placeholder="1.00"
                  value={customSlippageInput}
                />
                <span className="text-sm text-[var(--text-muted)]">%</span>
              </div>
            </div>
          </div>

          {activeQuote ? (
            <div className="surface-muted rounded-[var(--radius-lg)] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Quote breakdown</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--text-faint)]">
                    {activeMode === "buy"
                      ? "Server-side quote and simulation from the active pool."
                      : "Exact sell quote using current LaunchPool state."}
                  </p>
                </div>
                <TradeStatusPill
                  label={quoteState.status === "loading" ? "Getting quote" : "Quote ready"}
                  tone={quoteState.status === "loading" ? "warning" : "success"}
                />
              </div>

              {activeMode === "buy" && selectedBuyQuote ? (
                <dl className="mt-5 space-y-3">
                  <DetailRow
                    label="Expected token output"
                    value={formatTokenAmount(
                      BigInt(selectedBuyQuote.quote.tokenAmountOut),
                      tokenDecimals
                    )}
                  />
                  <DetailRow
                    label="Buy fee"
                    value={`${formatUsdcAmount(BigInt(selectedBuyQuote.quote.fee))} USDC`}
                  />
                  <DetailRow
                    label="Minimum received"
                    value={
                      buyMinimumReceived !== null
                        ? formatTokenAmount(buyMinimumReceived, tokenDecimals)
                        : "Unavailable"
                    }
                  />
                  <DetailRow
                    label="Net USDC input"
                    value={`${formatUsdcAmount(BigInt(selectedBuyQuote.quote.netUsdcIn))} USDC`}
                  />
                  <DetailRow
                    label="Next reserve"
                    value={`${formatUsdcAmount(BigInt(selectedBuyQuote.quote.nextState.realUsdcReserve))} USDC`}
                  />
                  {selectedBuyQuote.reachesGraduationThreshold ? (
                    <div className="rounded-[var(--radius-md)] border border-amber-300/18 bg-amber-300/8 px-4 py-3 text-sm leading-6 text-amber-100">
                      This buy reaches the graduation threshold exactly. The pool will move to
                      Graduation Pending after a successful trade.
                    </div>
                  ) : null}
                </dl>
              ) : null}

              {activeMode === "sell" && selectedSellQuote ? (
                <dl className="mt-5 space-y-3">
                  <DetailRow
                    label="Expected net USDC output"
                    value={`${formatUsdcAmount(BigInt(selectedSellQuote.quote.netUsdcAmountOut))} USDC`}
                  />
                  <DetailRow
                    label="Gross USDC output"
                    value={`${formatUsdcAmount(BigInt(selectedSellQuote.quote.grossUsdcAmountOut))} USDC`}
                  />
                  <DetailRow
                    label="Sell fee"
                    value={`${formatUsdcAmount(BigInt(selectedSellQuote.quote.fee))} USDC`}
                  />
                  <DetailRow
                    label="Minimum received"
                    value={
                      sellMinimumReceived !== null
                        ? `${formatUsdcAmount(sellMinimumReceived)} USDC`
                        : "Unavailable"
                    }
                  />
                  <DetailRow
                    label="Next reserve"
                    value={`${formatUsdcAmount(BigInt(selectedSellQuote.quote.nextState.realUsdcReserve))} USDC`}
                  />
                </dl>
              ) : null}
            </div>
          ) : null}

          {quoteState.status === "error" ? (
            <div className="rounded-[var(--radius-md)] border border-rose-300/18 bg-rose-300/8 px-4 py-3 text-sm leading-6 text-rose-100">
              {quoteState.error.message}
            </div>
          ) : null}

          {!isConnected ? (
            <div className="surface-muted rounded-[var(--radius-lg)] p-4 sm:p-5">
              <p className="text-sm leading-6 text-[var(--text-secondary)]">
                Connect your browser wallet to quote, approve exact amounts, and trade directly on
                Arc Testnet.
              </p>
              <div className="mt-4 w-fit">
                <WalletConnectButton />
              </div>
            </div>
          ) : null}

          {isConnected && isWrongChain ? (
            <div className="rounded-[var(--radius-lg)] border border-amber-300/18 bg-amber-300/8 p-4 sm:p-5">
              <p className="text-sm leading-6 text-amber-50">
                Your wallet is connected to {connection.chain?.name ?? "the wrong network"}. Switch
                to Arc Testnet to trade this pool.
              </p>
              <div className="mt-4 w-fit">
                <Button
                  disabled={isSwitchPending}
                  onClick={() => {
                    void handleSwitchNetwork().catch((error) => {
                      setFeedback({
                        mode: activeMode,
                        phase: isWalletRejection(error) ? "rejected by user" : "wrong chain",
                        message: formatWalletError(error, "Unable to switch to Arc Testnet.")
                      });
                    });
                  }}
                  size="sm"
                >
                  {isSwitchPending ? "Switching..." : "Switch to Arc Testnet"}
                </Button>
              </div>
            </div>
          ) : null}

          {tradeData ? (
            <div className="space-y-3">
              <Button
                className="w-full justify-center"
                disabled={
                  isConnected && !isWrongChain
                    ? Boolean(activeDisabledReason) || isSwitchPending || isWritePending
                    : true
                }
                fullWidth
                onClick={() => {
                  if (activeMode === "buy") {
                    void handleExecuteBuy();
                    return;
                  }

                  void handleExecuteSell();
                }}
              >
                <span className="inline-flex min-h-5 items-center justify-center">
                  {actionButtonLabel}
                </span>
              </Button>
              {activeDisabledReason ? (
                <p className="text-sm leading-6 text-[var(--text-muted)]">{activeDisabledReason}</p>
              ) : null}
            </div>
          ) : null}

          <FeedbackCard
            feedback={feedback}
            onDismiss={handleResetTradeState}
            onStartAnotherTrade={handleStartAnotherTrade}
          />
        </div>
      ) : null}
    </aside>
  );
}
