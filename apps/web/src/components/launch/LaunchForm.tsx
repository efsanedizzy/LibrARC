"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BaseError, useConnection, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { getAddress } from "viem";

import { erc20Abi, launchFactoryAbi } from "../../lib/arc/abis";
import { arcDeployment } from "../../lib/arc/config";
import {
  formatCompactAddress,
  formatLaunchTokenAmount,
  formatUsdcAmount
} from "../../lib/arc/format";
import {
  buildArcLaunchApiPath,
  isArcLaunchApiError,
  isArcLaunchApproveSimulationSuccess,
  isArcLaunchConfigSuccess,
  isArcLaunchInitialBuyQuoteSuccess,
  isArcLaunchSimulationSuccess,
  type ArcLaunchApiError,
  type ArcLaunchConfigSuccess,
  type ArcLaunchInitialBuyQuoteSuccess
} from "../../lib/arc/launch-api";
import {
  calculateMinimumTokenOutput,
  parseOptionalInitialPurchaseUsdcAmount
} from "../../lib/arc/launch-buy";
import {
  buildArcScanAddressUrl,
  buildArcScanTransactionUrl,
  buildLaunchMetadata,
  buildLaunchTokenPagePath,
  decodeCreatorInitialPurchaseEventFromReceipt,
  decodeLaunchCreatedEventFromReceipt
} from "../../lib/arc/launch-metadata";
import {
  DEFAULT_SLIPPAGE_BPS,
  formatSlippageBps,
  getFreshDeadlineSeconds,
  isWalletRejection,
  parseSlippagePercentToBps,
  SLIPPAGE_PRESET_BPS,
  waitForWalletTransactionReceipt
} from "../../lib/arc/trading";
import { arcTestnet } from "../../lib/chains/arc-testnet";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { LaunchField } from "./LaunchField";
import { LaunchImageUpload } from "./LaunchImageUpload";
import { LaunchSection } from "./LaunchSection";
import { LaunchSummary } from "./LaunchSummary";
import {
  INITIAL_CUSTOM_SLIPPAGE_INPUT,
  INITIAL_LAUNCH_FORM_VALUES,
  createLaunchComposerResetState,
  createLaunchPartialSuccessState,
  createLaunchTransactionPendingFeedback,
  getLaunchFeedbackFromApiError,
  getLaunchFeedbackFromWalletError,
  getLaunchLivePhase,
  getLaunchSubmitDisabledReason,
  shouldClearLaunchFeedbackOnInputChange,
  isPendingLaunchPhase
} from "./state";
import type {
  LaunchFeedback,
  LaunchFieldName,
  LaunchFormErrors,
  LaunchFormValues,
  LaunchPartialSuccessState,
  LaunchSuccessState,
  LaunchTechnicalDetail
} from "./types";
import { getAllErrors, getDisplayValue, getLaunchMetadataPreview } from "./validation";

const ARC_TESTNET_NOTICE =
  "Arc Testnet only - created tokens and test assets have no monetary value.";

type LaunchConfigState = {
  data: ArcLaunchConfigSuccess | null;
  error: LaunchFeedback | null;
  isLoading: boolean;
};

type InitialBuyQuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: ArcLaunchInitialBuyQuoteSuccess }
  | { status: "error"; error: ArcLaunchApiError };

function getFieldError(
  field: LaunchFieldName,
  touchedFields: Partial<Record<LaunchFieldName, boolean>>,
  errors: LaunchFormErrors,
  hasSubmitted: boolean
) {
  if (!touchedFields[field] && !hasSubmitted) {
    return undefined;
  }

  return errors[field];
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof BaseError) {
    return error.shortMessage || fallback;
  }

  if (error instanceof Error) {
    return error.message || fallback;
  }

  return fallback;
}

async function readJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  const payload = (await response.json()) as unknown;

  if (!response.ok) {
    if (isArcLaunchApiError(payload)) {
      throw payload;
    }

    throw {
      ok: false,
      code: "RPC_UNAVAILABLE",
      details: [
        {
          label: typeof input === "string" ? input : "Arc launch route",
          message: `The route returned HTTP ${response.status}.`
        }
      ],
      message: `The route returned HTTP ${response.status}.`
    } satisfies ArcLaunchApiError;
  }

  return payload as T;
}

function parseMaxMetadataUriLength(config: ArcLaunchConfigSuccess | null) {
  if (!config) {
    return null;
  }

  const parsed = Number(config.factory.maxMetadataUriLength);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function DetailList({ details }: { details: LaunchTechnicalDetail[] }) {
  if (details.length === 0) {
    return null;
  }

  return (
    <details className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-white">
        Technical details
      </summary>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
        {details.map((detail) => (
          <li key={`${detail.label}-${detail.message}`}>
            <span className="font-semibold text-white">{detail.label}:</span> {detail.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

function FeedbackCard({ feedback }: { feedback: LaunchFeedback | null }) {
  if (!feedback) {
    return null;
  }

  const toneClassName =
    feedback.phase === "user rejected"
      ? "border-amber-300/20 bg-amber-300/10 text-amber-50"
      : feedback.phase === "approval confirmed"
        ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-50"
        : "border-rose-300/20 bg-rose-300/10 text-rose-50";

  return (
    <Card className={`space-y-4 rounded-[1.5rem] ${toneClassName}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]">
          {feedback.phase}
        </span>
        {feedback.txHash ? (
          <Link
            className="text-sm font-semibold text-cyan-100 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            href={buildArcScanTransactionUrl(arcDeployment.explorerUrl, feedback.txHash)}
            rel="noreferrer"
            target="_blank"
          >
            {feedback.txHash}
          </Link>
        ) : null}
      </div>
      <p className="text-sm leading-6">{feedback.message}</p>
      <DetailList details={feedback.details ?? []} />
    </Card>
  );
}

function ResultField({ label, value, href }: { href?: string; label: string; value: string }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
        {label}
      </label>
      <input
        className="min-h-11 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white"
        readOnly
        value={value}
      />
      {href ? (
        <Link
          className="inline-flex text-sm font-semibold text-cyan-100 transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          href={href}
          rel="noreferrer"
          target={href.startsWith("http") ? "_blank" : undefined}
        >
          Open link
        </Link>
      ) : null}
    </div>
  );
}

function SuccessPanel({ onReset, success }: { onReset: () => void; success: LaunchSuccessState }) {
  return (
    <Card className="space-y-5 rounded-[1.5rem] border-emerald-300/20 bg-emerald-300/10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100/80">
          Launch created
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Your Arc Testnet launch was confirmed.
        </h2>
      </div>

      <div className="grid gap-4">
        <ResultField label="Launch ID" value={success.launchId} />
        <ResultField
          label="Token address"
          value={success.tokenAddress}
          href={buildArcScanAddressUrl(arcDeployment.explorerUrl, success.tokenAddress)}
        />
        <ResultField
          label="Pool address"
          value={success.poolAddress}
          href={buildArcScanAddressUrl(arcDeployment.explorerUrl, success.poolAddress)}
        />
        <ResultField
          label="Factory address"
          value={success.factoryAddress}
          href={buildArcScanAddressUrl(arcDeployment.explorerUrl, success.factoryAddress)}
        />
        <ResultField
          label="Transaction hash"
          value={success.txHash}
          href={buildArcScanTransactionUrl(arcDeployment.explorerUrl, success.txHash)}
        />
        {success.initialPurchase ? (
          <>
            <ResultField
              label="Initial USDC amount"
              value={`${formatUsdcAmount(BigInt(success.initialPurchase.usdcAmountIn))} USDC`}
            />
            <ResultField
              label="Tokens received"
              value={formatLaunchTokenAmount(BigInt(success.initialPurchase.tokenAmountOut))}
            />
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button href={buildLaunchTokenPagePath(success.tokenAddress)}>Open token page</Button>
        <Button
          href={buildArcScanTransactionUrl(arcDeployment.explorerUrl, success.txHash)}
          rel="noreferrer"
          target="_blank"
          variant="secondary"
        >
          View on ArcScan
        </Button>
        <Button onClick={onReset} variant="ghost">
          Create another token
        </Button>
      </div>
    </Card>
  );
}

function PartialSuccessPanel({
  onReset,
  partial
}: {
  onReset: () => void;
  partial: LaunchPartialSuccessState;
}) {
  return (
    <Card className="space-y-5 rounded-[1.5rem] border-cyan-300/20 bg-cyan-300/10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/80">
          Transaction confirmed
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{partial.message}</h2>
      </div>

      <div className="grid gap-4">
        <ResultField label="Receipt status" value={partial.receiptStatus} />
        <ResultField
          label="Factory address"
          value={partial.factoryAddress}
          href={buildArcScanAddressUrl(arcDeployment.explorerUrl, partial.factoryAddress)}
        />
        <ResultField
          label="Transaction hash"
          value={partial.txHash}
          href={buildArcScanTransactionUrl(arcDeployment.explorerUrl, partial.txHash)}
        />
        {partial.initialPurchaseAmount ? (
          <ResultField
            label="Initial USDC amount"
            value={`${partial.initialPurchaseAmount} USDC`}
          />
        ) : null}
      </div>

      <DetailList details={partial.details ?? []} />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          href={buildArcScanTransactionUrl(arcDeployment.explorerUrl, partial.txHash)}
          rel="noreferrer"
          target="_blank"
          variant="secondary"
        >
          View on ArcScan
        </Button>
        <Button onClick={onReset} variant="ghost">
          Create another token
        </Button>
      </div>
    </Card>
  );
}

function getQuoteFeedbackFromApiError(error: ArcLaunchApiError): LaunchFeedback {
  return {
    phase: error.code === "RPC_UNAVAILABLE" ? "rpc unavailable" : "quote unavailable",
    message: error.revert?.reason || error.revert?.message || error.message,
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

export function LaunchForm() {
  const nameId = useId();
  const symbolId = useId();
  const descriptionId = useId();
  const artworkInputId = useId();
  const xProfileId = useId();
  const telegramId = useId();
  const initialPurchaseId = useId();
  const customSlippageId = useId();

  const [values, setValues] = useState<LaunchFormValues>(INITIAL_LAUNCH_FORM_VALUES);
  const [touchedFields, setTouchedFields] = useState<Partial<Record<LaunchFieldName, boolean>>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<LaunchFeedback | null>(null);
  const [success, setSuccess] = useState<LaunchSuccessState | null>(null);
  const [partialSuccess, setPartialSuccess] = useState<LaunchPartialSuccessState | null>(null);
  const [configState, setConfigState] = useState<LaunchConfigState>({
    data: null,
    error: null,
    isLoading: true
  });
  const [initialBuyQuoteState, setInitialBuyQuoteState] = useState<InitialBuyQuoteState>({
    status: "idle"
  });
  const [slippageMode, setSlippageMode] = useState<"preset" | "custom">("preset");
  const [presetSlippageBps, setPresetSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS);
  const [customSlippageInput, setCustomSlippageInput] = useState(INITIAL_CUSTOM_SLIPPAGE_INPUT);
  const [artworkPreviewUrl, setArtworkPreviewUrl] = useState<string | null>(null);
  const [artworkFileName, setArtworkFileName] = useState("");
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const [xProfile, setXProfile] = useState("");
  const [telegram, setTelegram] = useState("");
  const artworkObjectUrlRef = useRef<string | null>(null);

  const connection = useConnection();
  const { mutateAsync: switchChainAsync, isPending: isSwitchPending } = useSwitchChain();
  const { mutateAsync: writeContractAsync, isPending: isWritePending } = useWriteContract();

  const walletAddress = connection.address ? getAddress(connection.address) : undefined;
  const isConnected = connection.isConnected && Boolean(walletAddress);
  const isWrongNetwork = isConnected && connection.chainId !== arcTestnet.id;
  const hasConfirmedOutcome = Boolean(success || partialSuccess);
  const maxMetadataUriLength = parseMaxMetadataUriLength(configState.data);
  const metadataPreview = useMemo(() => getLaunchMetadataPreview(values), [values]);
  const allErrors = useMemo(
    () => getAllErrors(values, maxMetadataUriLength),
    [maxMetadataUriLength, values]
  );
  const hasValidationErrors = Object.keys(allErrors).length > 0;
  const isSubmitting =
    isWritePending || isPendingLaunchPhase(feedback?.phase ?? null) || isSwitchPending;
  const parsedInitialPurchaseAmount = useMemo(() => {
    try {
      return parseOptionalInitialPurchaseUsdcAmount(values.initialPurchaseAmount);
    } catch {
      return null;
    }
  }, [values.initialPurchaseAmount]);
  const isInitialPurchaseRequested =
    values.initialPurchaseEnabled &&
    parsedInitialPurchaseAmount !== null &&
    parsedInitialPurchaseAmount > 0n;
  const parsedCustomSlippage = useMemo(() => {
    try {
      return parseSlippagePercentToBps(customSlippageInput);
    } catch {
      return null;
    }
  }, [customSlippageInput]);
  const effectiveSlippageBps = slippageMode === "custom" ? parsedCustomSlippage : presetSlippageBps;

  const usdcBalanceQuery = useReadContract({
    abi: erc20Abi,
    address: arcDeployment.usdcAddress,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    query: {
      enabled: Boolean(walletAddress) && values.initialPurchaseEnabled,
      refetchInterval: 30_000
    }
  });
  const usdcAllowanceQuery = useReadContract({
    abi: erc20Abi,
    address: arcDeployment.usdcAddress,
    functionName: "allowance",
    args: walletAddress ? [walletAddress, arcDeployment.factoryAddress] : undefined,
    query: {
      enabled: Boolean(walletAddress) && values.initialPurchaseEnabled,
      refetchInterval: 30_000
    }
  });

  const currentUsdcBalance = usdcBalanceQuery.data ?? 0n;
  const currentUsdcAllowance = usdcAllowanceQuery.data ?? 0n;
  const selectedInitialBuyQuote =
    initialBuyQuoteState.status === "ready" ? initialBuyQuoteState.data : null;
  const minimumInitialTokenOutput =
    selectedInitialBuyQuote && effectiveSlippageBps !== null
      ? calculateMinimumTokenOutput(
          BigInt(selectedInitialBuyQuote.quote.tokenAmountOut),
          effectiveSlippageBps
        )
      : null;

  const baseSubmitDisabledReason = getLaunchSubmitDisabledReason({
    hasConfirmedOutcome,
    hasValidationErrors,
    hasVerifiedConfig: maxMetadataUriLength !== null,
    isConnected,
    isFactoryPaused: configState.data?.factory.paused ?? false,
    isSubmitting,
    isWrongChain: isWrongNetwork,
    isLoadingConfig: configState.isLoading
  });
  const submitDisabledReason =
    baseSubmitDisabledReason ??
    (!artworkPreviewUrl ? "Upload token artwork before launching." : null) ??
    (values.initialPurchaseEnabled && effectiveSlippageBps === null
      ? "Enter a valid slippage value."
      : values.initialPurchaseEnabled &&
          parsedInitialPurchaseAmount !== null &&
          parsedInitialPurchaseAmount > 0n &&
          currentUsdcBalance < parsedInitialPurchaseAmount
        ? "USDC balance is too low for the requested initial purchase."
        : values.initialPurchaseEnabled &&
            parsedInitialPurchaseAmount !== null &&
            parsedInitialPurchaseAmount > 0n &&
            initialBuyQuoteState.status === "loading"
          ? "Refreshing the initial-purchase quote."
          : values.initialPurchaseEnabled &&
              parsedInitialPurchaseAmount !== null &&
              parsedInitialPurchaseAmount > 0n &&
              initialBuyQuoteState.status === "error"
            ? initialBuyQuoteState.error.message
            : values.initialPurchaseEnabled &&
                parsedInitialPurchaseAmount !== null &&
                parsedInitialPurchaseAmount > 0n &&
                !selectedInitialBuyQuote
              ? "A fresh initial-purchase quote is required."
              : null);

  useEffect(() => {
    void refreshLaunchConfig();
  }, []);

  useEffect(() => {
    return () => {
      if (artworkObjectUrlRef.current) {
        URL.revokeObjectURL(artworkObjectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (
      !shouldClearLaunchFeedbackOnInputChange({
        feedback,
        hasConfirmedOutcome
      })
    ) {
      return;
    }

    setFeedback(null);
  }, [feedback, hasConfirmedOutcome, values, slippageMode, presetSlippageBps, customSlippageInput]);

  useEffect(() => {
    if (
      !values.initialPurchaseEnabled ||
      !walletAddress ||
      !isConnected ||
      isWrongNetwork ||
      !parsedInitialPurchaseAmount ||
      parsedInitialPurchaseAmount <= 0n
    ) {
      setInitialBuyQuoteState({ status: "idle" });
      return;
    }

    const purchaseError = allErrors.initialPurchaseAmount;

    if (purchaseError) {
      setInitialBuyQuoteState({
        status: "error",
        error: {
          ok: false,
          code: "INVALID_AMOUNT",
          message: purchaseError,
          details: [
            {
              label: "Initial purchase",
              message: purchaseError
            }
          ]
        }
      });
      return;
    }

    const abortController = new AbortController();

    setInitialBuyQuoteState({ status: "loading" });

    void readJson(buildArcLaunchApiPath("quote-initial-buy"), {
      method: "POST",
      body: JSON.stringify({
        walletAddress,
        name: values.name,
        symbol: values.symbol,
        metadataUri: metadataPreview.uri,
        usdcAmount: values.initialPurchaseAmount
      }),
      headers: {
        "content-type": "application/json"
      },
      signal: abortController.signal
    })
      .then((payload) => {
        if (!isArcLaunchInitialBuyQuoteSuccess(payload)) {
          throw payload;
        }

        setInitialBuyQuoteState({
          status: "ready",
          data: payload
        });
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        setInitialBuyQuoteState({
          status: "error",
          error: isArcLaunchApiError(error)
            ? error
            : {
                ok: false,
                code: "RPC_UNAVAILABLE",
                message: error instanceof Error ? error.message : "Initial purchase quote failed.",
                details: [
                  {
                    label: "Initial purchase quote",
                    message:
                      error instanceof Error ? error.message : "Initial purchase quote failed."
                  }
                ]
              }
        });
      });

    return () => {
      abortController.abort();
    };
  }, [
    allErrors.initialPurchaseAmount,
    isConnected,
    isWrongNetwork,
    metadataPreview.uri,
    parsedInitialPurchaseAmount,
    values.initialPurchaseAmount,
    values.initialPurchaseEnabled,
    values.name,
    values.symbol,
    walletAddress
  ]);

  async function refreshLaunchConfig() {
    setConfigState((current) => ({
      ...current,
      error: null,
      isLoading: true
    }));

    try {
      const payload = await readJson<ArcLaunchConfigSuccess>(buildArcLaunchApiPath("config"));

      if (!isArcLaunchConfigSuccess(payload)) {
        throw {
          ok: false,
          code: "CONTRACT_READ_FAILED",
          details: [
            {
              label: "Launch config",
              message: "Unexpected launch config response."
            }
          ],
          message: "Unexpected launch config response."
        } satisfies ArcLaunchApiError;
      }

      setConfigState({
        data: payload,
        error: null,
        isLoading: false
      });
    } catch (error) {
      const routeError = isArcLaunchApiError(error)
        ? getLaunchFeedbackFromApiError(error)
        : {
            phase: "rpc unavailable" as const,
            message: getErrorMessage(
              error,
              "Unable to load the verified LaunchFactory configuration."
            )
          };

      setConfigState({
        data: null,
        error: routeError,
        isLoading: false
      });
    }
  }

  function markFieldTouched(field: LaunchFieldName) {
    setTouchedFields((current) => ({
      ...current,
      [field]: true
    }));
  }

  function handleStringChange(field: keyof LaunchFormValues, nextValue: string) {
    setValues((current) => ({
      ...current,
      [field]: nextValue
    }));
  }

  function handleBooleanChange(field: keyof LaunchFormValues, nextValue: boolean) {
    setValues((current) => ({
      ...current,
      [field]: nextValue
    }));
  }

  function handleArtworkSelection(fileList: FileList | null) {
    const file = fileList?.[0];

    if (!file) {
      return;
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setArtworkError("Upload a PNG, JPG, or WEBP image.");
      return;
    }

    if (artworkObjectUrlRef.current) {
      URL.revokeObjectURL(artworkObjectUrlRef.current);
    }

    const nextObjectUrl = URL.createObjectURL(file);

    artworkObjectUrlRef.current = nextObjectUrl;
    setArtworkPreviewUrl(nextObjectUrl);
    setArtworkFileName(file.name);
    setArtworkError(null);
  }

  function handleCreateAnotherToken() {
    const reset = createLaunchComposerResetState();

    if (artworkObjectUrlRef.current) {
      URL.revokeObjectURL(artworkObjectUrlRef.current);
      artworkObjectUrlRef.current = null;
    }

    setValues(reset.values);
    setTouchedFields(reset.touchedFields);
    setHasSubmitted(reset.hasSubmitted);
    setFeedback(reset.feedback);
    setSuccess(reset.success);
    setPartialSuccess(reset.partialSuccess);
    setSlippageMode(reset.slippageMode);
    setPresetSlippageBps(reset.presetSlippageBps);
    setCustomSlippageInput(reset.customSlippageInput);
    setInitialBuyQuoteState({ status: "idle" });
    setArtworkPreviewUrl(null);
    setArtworkFileName("");
    setArtworkError(null);
    setXProfile("");
    setTelegram("");
  }

  async function handleSwitchNetwork() {
    try {
      await switchChainAsync({
        chainId: arcTestnet.id,
        addEthereumChainParameter: {
          blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
          chainName: arcTestnet.name,
          nativeCurrency: arcTestnet.nativeCurrency,
          rpcUrls: arcTestnet.rpcUrls.default.http
        }
      });
    } catch (error) {
      setFeedback(getLaunchFeedbackFromWalletError(error, "Unable to switch to Arc Testnet."));
    }
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

  async function fetchFreshInitialBuyQuote() {
    if (!walletAddress) {
      throw new Error("The connected wallet address is unavailable.");
    }

    const payload = await readJson(buildArcLaunchApiPath("quote-initial-buy"), {
      method: "POST",
      body: JSON.stringify({
        walletAddress,
        name: values.name,
        symbol: values.symbol,
        metadataUri: metadataPreview.uri,
        usdcAmount: values.initialPurchaseAmount
      }),
      headers: {
        "content-type": "application/json"
      }
    });

    if (!isArcLaunchInitialBuyQuoteSuccess(payload)) {
      throw payload;
    }

    setInitialBuyQuoteState({
      status: "ready",
      data: payload
    });

    return payload;
  }

  async function handleApproval(amount: bigint) {
    if (!walletAddress) {
      throw new Error("The connected wallet address is unavailable.");
    }

    const simulation = await readJson(buildArcLaunchApiPath("simulate-approve"), {
      method: "POST",
      body: JSON.stringify({
        walletAddress,
        amount: amount.toString(10)
      }),
      headers: {
        "content-type": "application/json"
      }
    });

    if (!isArcLaunchApproveSimulationSuccess(simulation)) {
      throw simulation;
    }

    const provider = await getInjectedProvider();

    setFeedback({
      phase: "wallet confirmation",
      message: "Confirm the exact Arc USDC approval in your browser wallet.",
      details: [
        {
          label: "Spender",
          message: arcDeployment.factoryAddress
        },
        {
          label: "Amount",
          message: `${formatUsdcAmount(amount)} USDC`
        }
      ]
    });

    const approvalHash = (await writeContractAsync({
      abi: erc20Abi,
      address: arcDeployment.usdcAddress,
      args: [arcDeployment.factoryAddress, amount],
      chainId: arcTestnet.id,
      functionName: "approve"
    })) as `0x${string}`;

    setFeedback({
      phase: "approving",
      message: "Approval submitted. Waiting for the Arc Testnet receipt.",
      txHash: approvalHash
    });

    const approvalReceipt = await waitForWalletTransactionReceipt(provider, approvalHash);

    if (approvalReceipt.status !== "0x1") {
      throw new Error("The approval transaction reverted on-chain.");
    }

    await Promise.all([usdcBalanceQuery.refetch(), usdcAllowanceQuery.refetch()]);

    setFeedback({
      phase: "approval confirmed",
      message: "Approval confirmed. Refreshing allowance and requesting a fresh quote.",
      txHash: approvalHash
    });
  }

  function finalizeConfirmedLaunchReceipt({
    initialPurchaseAmount,
    receipt,
    txHash
  }: {
    initialPurchaseAmount?: string;
    receipt: Awaited<ReturnType<typeof waitForWalletTransactionReceipt>>;
    txHash: `0x${string}`;
  }) {
    try {
      const launchCreated = decodeLaunchCreatedEventFromReceipt(
        receipt,
        arcDeployment.factoryAddress
      );
      const initialPurchase = initialPurchaseAmount
        ? decodeCreatorInitialPurchaseEventFromReceipt(receipt, arcDeployment.factoryAddress)
        : null;

      setPartialSuccess(null);
      setSuccess({
        launchId: launchCreated.launchId,
        creator: launchCreated.creator,
        factoryAddress: arcDeployment.factoryAddress,
        poolAddress: launchCreated.launchPool,
        tokenAddress: launchCreated.launchToken,
        txHash,
        initialPurchase: initialPurchase
          ? {
              usdcAmountIn: initialPurchase.usdcAmountIn,
              tokenAmountOut: initialPurchase.tokenAmountOut
            }
          : undefined
      });
      setFeedback(null);
    } catch (error) {
      setSuccess(null);
      setPartialSuccess(
        createLaunchPartialSuccessState({
          error,
          initialPurchaseAmount,
          txHash
        })
      );
      setFeedback(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasSubmitted(true);

    if (isSubmitting || hasConfirmedOutcome) {
      return;
    }

    setPartialSuccess(null);
    setSuccess(null);
    setFeedback({
      phase: "validating",
      message: "Validating the launch form before preparing the Arc Testnet transaction."
    });

    if (hasValidationErrors || !walletAddress) {
      setFeedback({
        phase: "contract reverted",
        message: "Fix the validation errors before preparing the launch transaction."
      });
      return;
    }

    const localMetadata = buildLaunchMetadata({
      name: values.name,
      symbol: values.symbol,
      description: values.description
    });

    setFeedback({
      phase: "loading configuration",
      message: "Fetching the latest verified LaunchFactory configuration."
    });

    let freshConfig: ArcLaunchConfigSuccess;

    try {
      freshConfig = await readJson<ArcLaunchConfigSuccess>(buildArcLaunchApiPath("config"));

      if (!isArcLaunchConfigSuccess(freshConfig)) {
        throw {
          ok: false,
          code: "CONTRACT_READ_FAILED",
          details: [
            {
              label: "Launch config",
              message: "Unexpected launch config response."
            }
          ],
          message: "Unexpected launch config response."
        } satisfies ArcLaunchApiError;
      }
    } catch (error) {
      setFeedback(
        isArcLaunchApiError(error)
          ? getLaunchFeedbackFromApiError(error)
          : {
              phase: "rpc unavailable",
              message: getErrorMessage(error, "Unable to refresh the LaunchFactory configuration.")
            }
      );
      return;
    }

    setConfigState({
      data: freshConfig,
      error: null,
      isLoading: false
    });

    const freshMaxMetadataUriLength = parseMaxMetadataUriLength(freshConfig);

    if (
      freshConfig.factory.paused ||
      freshMaxMetadataUriLength === null ||
      localMetadata.uriByteLength > freshMaxMetadataUriLength
    ) {
      setFeedback(
        freshConfig.factory.paused
          ? {
              phase: "contract reverted",
              message: "Launch creation is currently paused on the verified LaunchFactory."
            }
          : {
              phase: "contract reverted",
              message:
                freshMaxMetadataUriLength === null
                  ? "The factory metadata limit could not be read safely."
                  : `Metadata URI exceeds the factory limit of ${freshMaxMetadataUriLength} bytes.`
            }
      );
      return;
    }

    const purchaseAmount =
      values.initialPurchaseEnabled && parsedInitialPurchaseAmount !== null
        ? parsedInitialPurchaseAmount
        : null;
    const shouldUseStandardLaunch = !purchaseAmount || purchaseAmount === 0n;
    let submittedTxHash: `0x${string}` | undefined;

    try {
      if (shouldUseStandardLaunch) {
        setFeedback({
          phase: "simulating",
          message: "Simulating the exact createLaunch call before opening the browser wallet."
        });

        const simulation = await readJson(buildArcLaunchApiPath("simulate"), {
          method: "POST",
          body: JSON.stringify({
            walletAddress,
            mode: "createLaunch",
            name: values.name,
            symbol: values.symbol,
            metadataUri: localMetadata.uri
          }),
          headers: {
            "content-type": "application/json"
          }
        });

        if (!isArcLaunchSimulationSuccess(simulation)) {
          throw simulation;
        }

        const provider = await getInjectedProvider();

        setFeedback({
          phase: "wallet confirmation",
          message:
            "Confirm the exact LaunchFactory createLaunch transaction in your browser wallet."
        });

        submittedTxHash = (await writeContractAsync({
          abi: launchFactoryAbi,
          address: arcDeployment.factoryAddress,
          args: [values.name, values.symbol, localMetadata.uri],
          chainId: arcTestnet.id,
          functionName: "createLaunch"
        })) as `0x${string}`;

        setFeedback(
          createLaunchTransactionPendingFeedback(
            "Launch transaction submitted. Waiting for the Arc Testnet receipt.",
            submittedTxHash
          )
        );

        const receipt = await waitForWalletTransactionReceipt(provider, submittedTxHash);

        if (receipt.status !== "0x1") {
          throw new Error("The createLaunch transaction reverted on-chain.");
        }

        finalizeConfirmedLaunchReceipt({
          receipt,
          txHash: submittedTxHash
        });
        void refreshLaunchConfig();
        return;
      }

      if (effectiveSlippageBps === null) {
        setFeedback({
          phase: "quote unavailable",
          message: "Enter a valid slippage value before creating the launch."
        });
        return;
      }

      const balanceResult = await usdcBalanceQuery.refetch();
      const latestBalance = balanceResult.data ?? currentUsdcBalance;

      if (latestBalance < purchaseAmount) {
        setFeedback({
          phase: "insufficient balance",
          message: "USDC balance is too low for the requested initial purchase."
        });
        return;
      }

      setFeedback({
        phase: "validating",
        message: "Fetching a fresh initial-purchase quote from the verified launch math."
      });

      let quote = await fetchFreshInitialBuyQuote();
      let minimumTokenAmountOut = calculateMinimumTokenOutput(
        BigInt(quote.quote.tokenAmountOut),
        effectiveSlippageBps
      );

      const allowanceResult = await usdcAllowanceQuery.refetch();
      const latestAllowance = allowanceResult.data ?? currentUsdcAllowance;

      if (latestAllowance < purchaseAmount) {
        setFeedback({
          phase: "approval required",
          message: "An exact Arc USDC approval is required before createLaunchAndBuy can execute."
        });

        await handleApproval(purchaseAmount);

        const [postApprovalBalanceResult, postApprovalAllowanceResult] = await Promise.all([
          usdcBalanceQuery.refetch(),
          usdcAllowanceQuery.refetch()
        ]);
        const postApprovalBalance = postApprovalBalanceResult.data ?? latestBalance;
        const postApprovalAllowance = postApprovalAllowanceResult.data ?? latestAllowance;

        if (postApprovalBalance < purchaseAmount) {
          setFeedback({
            phase: "insufficient balance",
            message: "USDC balance changed and is now too low for the requested initial purchase."
          });
          return;
        }

        if (postApprovalAllowance < purchaseAmount) {
          setFeedback({
            phase: "contract reverted",
            message: "The Arc USDC allowance is still below the required initial-purchase amount."
          });
          return;
        }

        quote = await fetchFreshInitialBuyQuote();
        minimumTokenAmountOut = calculateMinimumTokenOutput(
          BigInt(quote.quote.tokenAmountOut),
          effectiveSlippageBps
        );
      }

      const deadline = getFreshDeadlineSeconds();

      setFeedback({
        phase: "simulating",
        message: "Simulating the exact createLaunchAndBuy call before opening the browser wallet."
      });

      const simulation = await readJson(buildArcLaunchApiPath("simulate"), {
        method: "POST",
        body: JSON.stringify({
          walletAddress,
          mode: "createLaunchAndBuy",
          name: values.name,
          symbol: values.symbol,
          metadataUri: localMetadata.uri,
          usdcAmountIn: purchaseAmount.toString(10),
          minTokenAmountOut: minimumTokenAmountOut.toString(10),
          deadline: deadline.toString(10)
        }),
        headers: {
          "content-type": "application/json"
        }
      });

      if (!isArcLaunchSimulationSuccess(simulation)) {
        throw simulation;
      }

      const provider = await getInjectedProvider();

      setFeedback({
        phase: "wallet confirmation",
        message:
          "Confirm the exact LaunchFactory createLaunchAndBuy transaction in your browser wallet.",
        details: [
          {
            label: "Approval spender",
            message: arcDeployment.factoryAddress
          },
          {
            label: "Recipient",
            message: walletAddress
          }
        ]
      });

      submittedTxHash = (await writeContractAsync({
        abi: launchFactoryAbi,
        address: arcDeployment.factoryAddress,
        args: [
          values.name,
          values.symbol,
          localMetadata.uri,
          purchaseAmount,
          minimumTokenAmountOut,
          deadline,
          walletAddress
        ],
        chainId: arcTestnet.id,
        functionName: "createLaunchAndBuy"
      })) as `0x${string}`;

      setFeedback(
        createLaunchTransactionPendingFeedback(
          "Launch transaction submitted. Waiting for the Arc Testnet receipt.",
          submittedTxHash
        )
      );

      const receipt = await waitForWalletTransactionReceipt(provider, submittedTxHash);

      if (receipt.status !== "0x1") {
        throw new Error("The createLaunchAndBuy transaction reverted on-chain.");
      }

      finalizeConfirmedLaunchReceipt({
        initialPurchaseAmount: values.initialPurchaseAmount.trim() || undefined,
        receipt,
        txHash: submittedTxHash
      });
      void refreshLaunchConfig();
    } catch (error) {
      if (isArcLaunchApiError(error)) {
        const nextFeedback =
          feedback?.phase === "approval confirmed" || feedback?.phase === "approval required"
            ? getQuoteFeedbackFromApiError(error)
            : getLaunchFeedbackFromApiError(error);

        setFeedback(
          submittedTxHash
            ? {
                ...nextFeedback,
                txHash: submittedTxHash
              }
            : nextFeedback
        );
        return;
      }

      const nextFeedback = getLaunchFeedbackFromWalletError(
        error,
        isWalletRejection(error)
          ? "Request rejected in your browser wallet."
          : "Launch creation failed."
      );

      setFeedback(
        submittedTxHash
          ? {
              ...nextFeedback,
              txHash: submittedTxHash
            }
          : nextFeedback
      );
    }
  }

  const nameError = getFieldError("name", touchedFields, allErrors, hasSubmitted);
  const symbolError = getFieldError("symbol", touchedFields, allErrors, hasSubmitted);
  const descriptionError = getFieldError("description", touchedFields, allErrors, hasSubmitted);
  const initialPurchaseAmountError = getFieldError(
    "initialPurchaseAmount",
    touchedFields,
    allErrors,
    hasSubmitted
  );
  const metadataError = getFieldError("metadata", touchedFields, allErrors, hasSubmitted);
  const livePhase = getLaunchLivePhase({
    feedback,
    hasPartialSuccess: Boolean(partialSuccess),
    hasSuccess: Boolean(success),
    isConnected,
    isLoadingConfig: configState.isLoading,
    isWrongChain: isWrongNetwork
  });

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      <div className="space-y-3">
        <Link
          className="inline-flex items-center gap-2 rounded-full text-sm font-semibold text-cyan-200 transition hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          href="/"
        >
          <span aria-hidden="true">&larr;</span>
          Back to home
        </Link>
        <div className="space-y-2">
          <h1 className="text-[2rem] font-semibold tracking-tight text-white sm:text-[2.5rem]">
            Launch token
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-slate-300">
            Create and launch your token on LibrARC with a simple, creator-first flow.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden border-[rgba(82,95,117,0.48)] bg-[linear-gradient(180deg,rgba(76,128,255,0.04),rgba(20,25,34,0.99)_22%,rgba(18,23,32,0.99))] p-0">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.08fr)_23.5rem]">
          <div className="space-y-5 p-5 sm:p-6 lg:p-7">
            <LaunchSection
              description="Fill out the essentials for your token launch. Keep it short, clean, and creator-friendly."
              eyebrow="Launch"
              id="launch-basics-heading"
              title="Basic details"
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem]">
                <LaunchField
                  className="h-full"
                  error={nameError}
                  errorId={`${nameId}-error`}
                  hint="Letters, numbers, and spaces. 32 characters max."
                  hintClassName="min-h-10"
                  hintId={`${nameId}-hint`}
                  htmlFor={nameId}
                  label="Name"
                  required
                >
                  <input
                    aria-describedby={[`${nameId}-hint`, nameError ? `${nameId}-error` : ""]
                      .filter(Boolean)
                      .join(" ")}
                    aria-invalid={Boolean(nameError)}
                    className="w-full rounded-[1rem] border border-white/10 bg-slate-950/80 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
                    id={nameId}
                    maxLength={64}
                    onBlur={() => markFieldTouched("name")}
                    onChange={(event) => handleStringChange("name", event.target.value)}
                    placeholder="Token name"
                    type="text"
                    value={values.name}
                  />
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {getDisplayValue(values.name).length} / 32
                  </p>
                </LaunchField>

                <LaunchField
                  className="h-full"
                  error={symbolError}
                  errorId={`${symbolId}-error`}
                  hint="Letters and numbers. 10 characters max."
                  hintClassName="min-h-10"
                  hintId={`${symbolId}-hint`}
                  htmlFor={symbolId}
                  label="Ticker"
                  required
                >
                  <input
                    aria-describedby={[`${symbolId}-hint`, symbolError ? `${symbolId}-error` : ""]
                      .filter(Boolean)
                      .join(" ")}
                    aria-invalid={Boolean(symbolError)}
                    className="w-full rounded-[1rem] border border-white/10 bg-slate-950/80 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
                    id={symbolId}
                    maxLength={10}
                    onBlur={() => markFieldTouched("symbol")}
                    onChange={(event) => handleStringChange("symbol", event.target.value)}
                    placeholder="symbol"
                    spellCheck={false}
                    type="text"
                    value={values.symbol}
                  />
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {getDisplayValue(values.symbol).length} / 10
                  </p>
                </LaunchField>
              </div>

              <LaunchField
                error={descriptionError}
                errorId={`${descriptionId}-error`}
                hint="No links. Keep it concise. Empty descriptions are omitted from launch metadata."
                hintId={`${descriptionId}-hint`}
                htmlFor={descriptionId}
                label="Description"
                labelNote="(optional)"
              >
                <textarea
                  aria-describedby={[
                    `${descriptionId}-hint`,
                    descriptionError ? `${descriptionId}-error` : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-invalid={Boolean(descriptionError)}
                  className="min-h-28 w-full rounded-[1rem] border border-white/10 bg-slate-950/80 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
                  id={descriptionId}
                  maxLength={500}
                  onBlur={() => markFieldTouched("description")}
                  onChange={(event) => handleStringChange("description", event.target.value)}
                  placeholder="A short description of the token"
                  value={values.description}
                />
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  {getDisplayValue(values.description).length} / 500
                </p>
              </LaunchField>
            </LaunchSection>

            <LaunchSection
              description="Upload the token artwork that will represent your launch in the UI preview."
              id="launch-artwork-heading"
              title="Token artwork"
            >
              <LaunchImageUpload
                error={artworkError}
                fileName={artworkFileName || null}
                helperText="Click to choose a file or drag one here. Artwork is required in this launch UI."
                inputId={artworkInputId}
                previewUrl={artworkPreviewUrl}
                required
                secondaryText="Confirm public upload first. The artwork preview is UI-only in this sprint and is not uploaded on-chain yet."
                title="Token image"
                onSelectFile={handleArtworkSelection}
              />
            </LaunchSection>

            <LaunchSection
              description="Optional social links help the preview card feel complete without adding clutter to the launch flow."
              id="launch-socials-heading"
              title="Socials"
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <LaunchField
                  hint="Optional"
                  hintId={`${xProfileId}-hint`}
                  htmlFor={xProfileId}
                  label="X profile"
                >
                  <input
                    aria-describedby={`${xProfileId}-hint`}
                    className="w-full rounded-[1rem] border border-white/10 bg-slate-950/80 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
                    id={xProfileId}
                    onChange={(event) => setXProfile(event.target.value)}
                    placeholder="x.com/handle"
                    type="text"
                    value={xProfile}
                  />
                </LaunchField>
                <LaunchField
                  hint="Optional"
                  hintId={`${telegramId}-hint`}
                  htmlFor={telegramId}
                  label="Telegram"
                >
                  <input
                    aria-describedby={`${telegramId}-hint`}
                    className="w-full rounded-[1rem] border border-white/10 bg-slate-950/80 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
                    id={telegramId}
                    onChange={(event) => setTelegram(event.target.value)}
                    placeholder="t.me/community"
                    type="text"
                    value={telegram}
                  />
                </LaunchField>
              </div>
            </LaunchSection>

            <LaunchSection
              description="Optional creator-side buy that can reuse the verified createLaunchAndBuy path."
              id="launch-dev-buy-heading"
              title="Developer buy"
            >
              <div className="space-y-4 rounded-[1.15rem] border border-white/10 bg-[rgba(255,255,255,0.03)] p-4">
                <label className="flex items-center gap-3 text-sm text-white">
                  <input
                    checked={values.initialPurchaseEnabled}
                    className="h-4 w-4 rounded border-white/20 bg-slate-950/80 text-cyan-300 focus:ring-cyan-300/40"
                    onChange={(event) => {
                      handleBooleanChange("initialPurchaseEnabled", event.target.checked);
                      if (!event.target.checked) {
                        handleStringChange("initialPurchaseAmount", "");
                      }
                    }}
                    type="checkbox"
                  />
                  <span>Enable developer buy</span>
                </label>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <LaunchField
                    error={initialPurchaseAmountError}
                    errorId={`${initialPurchaseId}-error`}
                    hint="Optional. Maximum 1,000,000 USDC."
                    hintId={`${initialPurchaseId}-hint`}
                    htmlFor={initialPurchaseId}
                    label="Amount"
                    labelNote="(optional)"
                  >
                    <input
                      aria-describedby={[
                        `${initialPurchaseId}-hint`,
                        initialPurchaseAmountError ? `${initialPurchaseId}-error` : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-invalid={Boolean(initialPurchaseAmountError)}
                      className="w-full rounded-[1rem] border border-white/10 bg-slate-950/80 px-4 py-3.5 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
                      id={initialPurchaseId}
                      inputMode="decimal"
                      onBlur={() => markFieldTouched("initialPurchaseAmount")}
                      onChange={(event) =>
                        handleStringChange("initialPurchaseAmount", event.target.value)
                      }
                      placeholder="0.00"
                      type="text"
                      value={values.initialPurchaseAmount}
                    />
                  </LaunchField>

                  <span className="inline-flex min-h-11 items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 text-sm font-semibold text-cyan-100">
                    Arc USDC
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-[0.95rem] border border-white/8 bg-slate-950/60 px-3.5 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Wallet USDC
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {walletAddress
                        ? usdcBalanceQuery.isPending
                          ? "Loading..."
                          : `${formatUsdcAmount(currentUsdcBalance)} USDC`
                        : "Connect wallet"}
                    </p>
                  </div>
                  <div className="rounded-[0.95rem] border border-white/8 bg-slate-950/60 px-3.5 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Allowance
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {walletAddress
                        ? usdcAllowanceQuery.isPending
                          ? "Loading..."
                          : `${formatUsdcAmount(currentUsdcAllowance)} USDC`
                        : "Connect wallet"}
                    </p>
                  </div>
                  <div className="rounded-[0.95rem] border border-white/8 bg-slate-950/60 px-3.5 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Spender
                    </p>
                    <p
                      className="mt-2 truncate text-sm font-semibold text-white"
                      title={arcDeployment.factoryAddress}
                    >
                      {formatCompactAddress(arcDeployment.factoryAddress)}
                    </p>
                  </div>
                </div>

                {selectedInitialBuyQuote ? (
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[0.95rem] border border-white/8 bg-slate-950/60 px-3.5 py-3">
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Expected output
                      </dt>
                      <dd className="mt-2 text-sm font-semibold text-white">
                        {formatLaunchTokenAmount(
                          BigInt(selectedInitialBuyQuote.quote.tokenAmountOut)
                        )}
                      </dd>
                    </div>
                    <div className="rounded-[0.95rem] border border-white/8 bg-slate-950/60 px-3.5 py-3">
                      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Net input
                      </dt>
                      <dd className="mt-2 text-sm font-semibold text-white">
                        {formatUsdcAmount(BigInt(selectedInitialBuyQuote.quote.netUsdcIn))} USDC
                      </dd>
                    </div>
                  </dl>
                ) : null}

                {initialBuyQuoteState.status === "error" ? (
                  <div className="rounded-[0.95rem] border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm leading-6 text-rose-100">
                    {initialBuyQuoteState.error.message}
                  </div>
                ) : null}
              </div>
            </LaunchSection>

            <details className="rounded-[1.15rem] border border-white/10 bg-[rgba(255,255,255,0.03)] px-4 py-4">
              <summary className="cursor-pointer text-sm font-semibold text-white">
                Advanced
              </summary>
              <div className="mt-4 space-y-5">
                <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Slippage
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
                  <div className="mt-3 flex items-center gap-3">
                    <input
                      className="min-h-11 w-full rounded-[1rem] border border-white/10 bg-slate-950/80 px-4 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
                      id={customSlippageId}
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

                <div className="rounded-[1rem] border border-white/8 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">Deterministic metadata URI</p>
                    <p
                      className={[
                        "text-xs font-semibold uppercase tracking-[0.24em]",
                        metadataError ? "text-rose-200" : "text-cyan-100/70"
                      ].join(" ")}
                    >
                      {maxMetadataUriLength === null
                        ? `${metadataPreview.uriByteLength} bytes`
                        : `${metadataPreview.uriByteLength} / ${maxMetadataUriLength} bytes`}
                    </p>
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-[0.95rem] border border-white/8 bg-[rgba(10,14,22,0.82)] p-4 text-xs leading-6 text-slate-200">
                    <code>{metadataPreview.json}</code>
                  </pre>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    The metadata is encoded as a compact <code>data:application/json</code> URI and
                    submitted directly to the LaunchFactory.
                  </p>
                  {metadataError ? (
                    <p className="mt-3 text-sm leading-6 text-rose-200" id="metadata-error">
                      {metadataError}
                    </p>
                  ) : null}
                </div>
              </div>
            </details>

            <LaunchSection
              description="Review the verified launch state and submit from your connected browser wallet."
              id="launch-action-heading"
              title="Final action"
            >
              <div className="space-y-4 rounded-[1.15rem] border border-white/10 bg-[rgba(255,255,255,0.03)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-white/8 bg-slate-950/65 px-4 py-3">
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Launch state
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {!isConnected
                        ? "Wallet not connected"
                        : isWrongNetwork
                          ? `Connected to ${connection.chain?.name ?? "the wrong network"}`
                          : `Connected as ${walletAddress ? formatCompactAddress(walletAddress) : "unknown"}`}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
                    {livePhase}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-white/8 bg-slate-950/45 px-4 py-3 text-sm text-slate-300">
                  <span>Launch fee: Configuration pending</span>
                  <span>Network: {arcTestnet.name}</span>
                </div>

                <p className="text-sm leading-6 text-amber-100">{ARC_TESTNET_NOTICE}</p>

                {!isConnected ? (
                  <div className="flex justify-start">
                    <WalletConnectButton />
                  </div>
                ) : isWrongNetwork ? (
                  <Button
                    className="w-full sm:w-auto"
                    disabled={isSwitchPending}
                    onClick={() => {
                      void handleSwitchNetwork();
                    }}
                    type="button"
                  >
                    {isSwitchPending ? "Switching..." : "Switch to Arc Testnet"}
                  </Button>
                ) : (
                  <Button
                    className="w-full border-0 bg-[linear-gradient(135deg,#8dff8e,#b8ff7e)] text-slate-950 hover:bg-[linear-gradient(135deg,#9dff9d,#c7ff8e)]"
                    disabled={Boolean(submitDisabledReason)}
                    size="lg"
                    type="submit"
                  >
                    {isSubmitting
                      ? "Launch in progress..."
                      : isInitialPurchaseRequested
                        ? "Launch token"
                        : "Launch token"}
                  </Button>
                )}

                {hasConfirmedOutcome ? (
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={handleCreateAnotherToken} type="button" variant="ghost">
                      Create another token
                    </Button>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={configState.isLoading}
                    onClick={() => {
                      void refreshLaunchConfig();
                    }}
                    type="button"
                    variant="secondary"
                  >
                    {configState.isLoading ? "Refreshing..." : "Refresh config"}
                  </Button>
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/12 px-4 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/40 hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
                    href={buildArcScanAddressUrl(
                      arcDeployment.explorerUrl,
                      arcDeployment.factoryAddress
                    )}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View Factory
                  </Link>
                </div>

                <p className="text-sm leading-6 text-slate-400">
                  {configState.isLoading
                    ? "Loading the verified Arc Testnet LaunchFactory configuration."
                    : configState.data?.factory.paused
                      ? "Launch creation is currently paused on the verified LaunchFactory."
                      : shouldUseStandardLaunchMessage(
                          values.initialPurchaseEnabled,
                          purchaseModeLabel(isInitialPurchaseRequested)
                        )}
                </p>

                {submitDisabledReason ? (
                  <p className="text-sm leading-6 text-slate-400">{submitDisabledReason}</p>
                ) : null}
              </div>
            </LaunchSection>
          </div>

          <aside className="border-t border-white/8 bg-[rgba(11,15,23,0.46)] p-5 sm:p-6 xl:sticky xl:top-24 xl:border-l xl:border-t-0 xl:self-start">
            <LaunchSummary
              connectedWalletAddress={walletAddress}
              imagePreviewUrl={artworkPreviewUrl}
              initialPurchaseAmount={
                isInitialPurchaseRequested ? values.initialPurchaseAmount : null
              }
              minimumTokenAmountOut={minimumInitialTokenOutput?.toString(10) ?? null}
              paused={configState.data?.factory.paused ?? false}
              purchaseMode={isInitialPurchaseRequested ? "createLaunchAndBuy" : "createLaunch"}
              telegram={telegram}
              values={values}
              xProfile={xProfile}
            />
          </aside>
        </div>
      </Card>

      {success ? <SuccessPanel onReset={handleCreateAnotherToken} success={success} /> : null}
      {partialSuccess ? (
        <PartialSuccessPanel onReset={handleCreateAnotherToken} partial={partialSuccess} />
      ) : null}
      {!success && !partialSuccess ? (
        <FeedbackCard feedback={feedback ?? configState.error} />
      ) : null}
    </form>
  );
}

function purchaseModeLabel(isInitialPurchaseRequested: boolean) {
  return isInitialPurchaseRequested ? "createLaunchAndBuy" : "createLaunch";
}

function shouldUseStandardLaunchMessage(
  initialPurchaseEnabled: boolean,
  mode: "createLaunch" | "createLaunchAndBuy"
) {
  if (!initialPurchaseEnabled || mode === "createLaunch") {
    return `Factory ${formatCompactAddress(arcDeployment.factoryAddress)} is ready for createLaunch.`;
  }

  return `Factory ${formatCompactAddress(arcDeployment.factoryAddress)} is ready for createLaunchAndBuy with exact approval to the Factory only.`;
}
