"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BaseError, useConnection, useSwitchChain, useWriteContract } from "wagmi";
import { type Address, getAddress } from "viem";

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
import { Card } from "../ui/Card";
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

function StatusBadge({
  children,
  tone = "neutral"
}: {
  children: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneClassName =
    tone === "success"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : "border-cyan-300/20 bg-cyan-300/10 text-cyan-100";

  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]",
        toneClassName
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="text-right text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function FeedbackCard({ feedback }: { feedback: TradeFeedback | null }) {
  if (!feedback) {
    return null;
  }

  const tone =
    feedback.phase === "success"
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
      : feedback.phase === "approval confirmed"
        ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-50"
        : feedback.phase === "rejected by user"
          ? "border-amber-300/20 bg-amber-300/10 text-amber-50"
          : "border-rose-300/20 bg-rose-300/10 text-rose-50";

  return (
    <div className={`space-y-3 rounded-3xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge
          tone={
            feedback.phase === "success"
              ? "success"
              : feedback.phase === "rejected by user"
                ? "warning"
                : "neutral"
          }
        >
          {feedback.phase}
        </StatusBadge>
        {feedback.txHash ? (
          <Link
            className="text-sm font-semibold text-cyan-100 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            href={buildExplorerTransactionUrl(arcDeployment.explorerUrl, feedback.txHash)}
            rel="noreferrer"
            target="_blank"
          >
            {shortenHash(feedback.txHash)}
          </Link>
        ) : null}
      </div>
      <p className="text-sm leading-6">{feedback.message}</p>
      {feedback.details && feedback.details.length > 0 ? (
        <details className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
          <summary className="cursor-pointer text-sm font-semibold">Technical details</summary>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-100/90">
            {feedback.details.map((detail) => (
              <li key={detail.label}>
                <span className="font-semibold text-white">{detail.label}:</span> {detail.message}
              </li>
            ))}
          </ul>
        </details>
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
    phase:
      error.code === "RPC_UNAVAILABLE"
        ? "rpc unavailable"
        : error.code === "SIMULATION_REVERTED"
          ? "reverted"
          : "reverted",
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
    if (feedback && TERMINAL_PHASES.has(feedback.phase)) {
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
      {
        walletAddress,
        usdcAmount: buyInput
      },
      { signal: abortController.signal }
    )
      .then((payload) => {
        if (!isArcBuyQuoteSuccess(payload)) {
          throw {
            ok: false,
            code: "RPC_UNAVAILABLE",
            message: "Unexpected buy quote response.",
            details: [
              {
                label: "quote-buy",
                message: "Unexpected buy quote response."
              }
            ]
          } satisfies ArcTradeApiError;
        }

        setBuyQuoteState({
          status: "ready",
          data: payload
        });
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
      {
        walletAddress,
        tokenAmount: sellInput
      },
      { signal: abortController.signal }
    )
      .then((payload) => {
        if (!isArcSellQuoteSuccess(payload)) {
          throw {
            ok: false,
            code: "RPC_UNAVAILABLE",
            message: "Unexpected sell quote response.",
            details: [
              {
                label: "quote-sell",
                message: "Unexpected sell quote response."
              }
            ]
          } satisfies ArcTradeApiError;
        }

        setSellQuoteState({
          status: "ready",
          data: payload
        });
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
        {
          label: "Spender",
          message: poolAddress
        },
        {
          label: "Amount",
          message: amount.toString(10)
        }
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
      setFeedback({
        mode: "buy",
        phase: "reverted",
        message: disabledReason
      });
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
        txHash: hash
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
        txHash: hash
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
      setFeedback({
        mode: "sell",
        phase: "reverted",
        message: disabledReason
      });
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
        txHash: hash
      });

      const receipt = await waitForWalletTransactionReceipt(provider, hash);

      if (receipt.status !== "0x1") {
        throw new Error("The sell transaction reverted on-chain.");
      }

      setFeedback({
        mode: "sell",
        phase: "success",
        message: "Sell confirmed. Refreshing balances, allowances, reserves, and curve state.",
        txHash: hash
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

  return (
    <Card className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">Trade</p>
        <h2 className="text-2xl font-semibold tracking-tight text-white">Buy or sell on Arc</h2>
        <p className="text-sm leading-6 text-slate-300">
          Arc Testnet only — test assets have no monetary value.
        </p>
      </div>

      <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
        <button
          className={[
            "flex-1 rounded-full px-4 py-2 text-sm font-semibold transition",
            activeMode === "buy"
              ? "bg-cyan-300/15 text-cyan-100"
              : "text-slate-400 hover:text-white"
          ].join(" ")}
          onClick={() => setActiveMode("buy")}
          type="button"
        >
          Buy
        </button>
        <button
          className={[
            "flex-1 rounded-full px-4 py-2 text-sm font-semibold transition",
            activeMode === "sell"
              ? "bg-cyan-300/15 text-cyan-100"
              : "text-slate-400 hover:text-white"
          ].join(" ")}
          onClick={() => setActiveMode("sell")}
          type="button"
        >
          Sell
        </button>
      </div>

      {isPageLoading && !tradeData ? (
        <div className="rounded-3xl border border-white/10 bg-white/4 p-5 text-sm text-slate-300">
          Loading pool trading controls...
        </div>
      ) : null}

      {tradeData ? (
        <div className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-white/4 p-5">
            <div className="flex items-center justify-between gap-4">
              <label
                className="text-sm font-semibold text-white"
                htmlFor={activeMode === "buy" ? "buy-usdc-input" : "sell-token-input"}
              >
                {activeMode === "buy" ? "USDC amount" : `${tokenSymbol} amount`}
              </label>
              <span className="text-xs uppercase tracking-[0.24em] text-slate-500">
                {activeMode === "buy" ? "6 decimals" : `${tokenDecimals} decimals`}
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <input
                  className="min-h-12 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
                  disabled={Boolean(feedback && !TERMINAL_PHASES.has(feedback.phase))}
                  id={activeMode === "buy" ? "buy-usdc-input" : "sell-token-input"}
                  inputMode="decimal"
                  onChange={(event) =>
                    activeMode === "buy"
                      ? setBuyInput(event.target.value)
                      : setSellInput(event.target.value)
                  }
                  placeholder={activeMode === "buy" ? "0.00" : "0.00"}
                  value={activeMode === "buy" ? buyInput : sellInput}
                />
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-right text-sm text-slate-300">
                <p>{activeMode === "buy" ? "Wallet USDC" : `Wallet ${tokenSymbol}`}</p>
                <p className="mt-1 font-semibold text-white">
                  {activeMode === "buy"
                    ? `${formatUsdcAmount(buyBalance)} USDC`
                    : formatTokenAmount(sellBalance, tokenDecimals)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  {activeMode === "buy" ? "Allowance to pool" : `${tokenSymbol} allowance`}
                </p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {activeMode === "buy"
                    ? formatAllowance(usdcAllowance, 6, "USDC")
                    : formatAllowance(tokenAllowance, tokenDecimals, tokenSymbol)}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  Spender: {poolAddress ? formatCompactAddress(poolAddress) : "Unavailable"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                  Slippage tolerance
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SLIPPAGE_PRESET_BPS.map((preset) => (
                    <button
                      className={[
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                        slippageMode === "preset" && presetSlippageBps === preset
                          ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                          : "border-white/10 text-slate-300 hover:border-cyan-300/25 hover:text-white"
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
                <div className="mt-3">
                  <label
                    className="text-xs uppercase tracking-[0.24em] text-slate-500"
                    htmlFor="custom-slippage-input"
                  >
                    Custom slippage
                  </label>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      className="min-h-11 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
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
                    <span className="text-sm text-slate-400">%</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    Selected:{" "}
                    {effectiveSlippageBps !== null
                      ? formatSlippageBps(effectiveSlippageBps)
                      : "Invalid"}
                    . Allowed range: 0.10% to 5.00%.
                  </p>
                </div>
              </div>
            </div>

            {activeMode === "buy" && selectedBuyQuote ? (
              <dl className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
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
                  label="Net USDC input"
                  value={`${formatUsdcAmount(BigInt(selectedBuyQuote.quote.netUsdcIn))} USDC`}
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
                  label="Next real USDC reserve"
                  value={`${formatUsdcAmount(BigInt(selectedBuyQuote.quote.nextState.realUsdcReserve))} USDC`}
                />
                <DetailRow
                  label="Next real token reserve"
                  value={formatTokenAmount(
                    BigInt(selectedBuyQuote.quote.nextState.realTokenReserve),
                    tokenDecimals
                  )}
                />
                {selectedBuyQuote.reachesGraduationThreshold ? (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
                    This buy reaches the graduation threshold exactly. Trading will move to
                    Graduation Pending after the transaction succeeds.
                  </div>
                ) : null}
              </dl>
            ) : null}

            {activeMode === "sell" && selectedSellQuote ? (
              <dl className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
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
                  label="Next real USDC reserve"
                  value={`${formatUsdcAmount(BigInt(selectedSellQuote.quote.nextState.realUsdcReserve))} USDC`}
                />
                <DetailRow
                  label="Next real token reserve"
                  value={formatTokenAmount(
                    BigInt(selectedSellQuote.quote.nextState.realTokenReserve),
                    tokenDecimals
                  )}
                />
              </dl>
            ) : null}

            {quoteState.status === "error" ? (
              <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm leading-6 text-rose-100">
                {quoteState.error.message}
              </div>
            ) : null}
          </div>

          {!isConnected ? (
            <div className="rounded-3xl border border-white/10 bg-white/4 p-5">
              <p className="text-sm leading-6 text-slate-300">
                Connect your browser wallet to quote, approve, and trade directly on Arc Testnet.
              </p>
              <div className="mt-4 w-fit">
                <WalletConnectButton />
              </div>
            </div>
          ) : isWrongChain ? (
            <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5">
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
                  variant="primary"
                >
                  {isSwitchPending ? "Switching..." : "Switch to Arc Testnet"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              disabled={
                Boolean(buyDisabledReason) ||
                isSwitchPending ||
                isWritePending ||
                activeMode !== "buy"
              }
              fullWidth
              onClick={() => {
                void handleExecuteBuy();
              }}
              variant="primary"
            >
              {feedback?.mode === "buy" && !TERMINAL_PHASES.has(feedback.phase)
                ? "Buy in progress..."
                : "Buy tokens"}
            </Button>
            <Button
              disabled={
                Boolean(sellDisabledReason) ||
                isSwitchPending ||
                isWritePending ||
                activeMode !== "sell"
              }
              fullWidth
              onClick={() => {
                void handleExecuteSell();
              }}
              variant="secondary"
            >
              {feedback?.mode === "sell" && !TERMINAL_PHASES.has(feedback.phase)
                ? "Sell in progress..."
                : "Sell tokens"}
            </Button>
          </div>

          {activeMode === "buy" && buyDisabledReason ? (
            <p className="text-sm leading-6 text-slate-400">{buyDisabledReason}</p>
          ) : null}
          {activeMode === "sell" && sellDisabledReason ? (
            <p className="text-sm leading-6 text-slate-400">{sellDisabledReason}</p>
          ) : null}

          <FeedbackCard feedback={feedback} />
        </div>
      ) : null}
    </Card>
  );
}
