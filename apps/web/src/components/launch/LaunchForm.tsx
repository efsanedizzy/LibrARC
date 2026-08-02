"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { BaseError, useConnection, useSwitchChain, useWriteContract } from "wagmi";
import { getAddress, type Address } from "viem";

import { launchFactoryAbi } from "../../lib/arc/abis";
import { arcDeployment } from "../../lib/arc/config";
import {
  buildArcLaunchApiPath,
  isArcLaunchApiError,
  isArcLaunchConfigSuccess,
  isArcLaunchSimulationSuccess,
  type ArcLaunchApiError,
  type ArcLaunchConfigSuccess
} from "../../lib/arc/launch-api";
import {
  buildArcScanAddressUrl,
  buildArcScanTransactionUrl,
  buildLaunchMetadata,
  buildLaunchTokenPagePath,
  decodeLaunchCreatedEventFromReceipt
} from "../../lib/arc/launch-metadata";
import { isWalletRejection, waitForWalletTransactionReceipt } from "../../lib/arc/trading";
import { arcTestnet } from "../../lib/chains/arc-testnet";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { LaunchField } from "./LaunchField";
import { LaunchSummary } from "./LaunchSummary";
import {
  getLaunchFeedbackFromApiError,
  getLaunchFeedbackFromWalletError,
  getLaunchSubmitDisabledReason,
  isPendingLaunchPhase
} from "./state";
import type {
  LaunchFeedback,
  LaunchFeedbackPhase,
  LaunchFieldName,
  LaunchFormErrors,
  LaunchFormValues,
  LaunchSuccessState,
  LaunchTechnicalDetail
} from "./types";
import { getAllErrors, getDisplayValue, getLaunchMetadataPreview } from "./validation";

const ARC_TESTNET_NOTICE =
  "Arc Testnet only - created tokens and test assets have no monetary value.";

const initialValues: LaunchFormValues = {
  name: "",
  symbol: "",
  description: ""
};

type LaunchConfigState = {
  data: ArcLaunchConfigSuccess | null;
  error: LaunchFeedback | null;
  isLoading: boolean;
};

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

function formatAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-5)}`;
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
    feedback.phase === "success"
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
      : feedback.phase === "user rejected"
        ? "border-amber-300/20 bg-amber-300/10 text-amber-50"
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

function SuccessPanel({ success }: { success: LaunchSuccessState }) {
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
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button href={buildLaunchTokenPagePath(success.tokenAddress)}>View token page</Button>
        <Button
          href={buildArcScanTransactionUrl(arcDeployment.explorerUrl, success.txHash)}
          rel="noreferrer"
          target="_blank"
          variant="secondary"
        >
          View on ArcScan
        </Button>
      </div>
    </Card>
  );
}

export function LaunchForm() {
  const nameId = useId();
  const symbolId = useId();
  const descriptionId = useId();

  const [values, setValues] = useState<LaunchFormValues>(initialValues);
  const [touchedFields, setTouchedFields] = useState<Partial<Record<LaunchFieldName, boolean>>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [feedback, setFeedback] = useState<LaunchFeedback | null>(null);
  const [success, setSuccess] = useState<LaunchSuccessState | null>(null);
  const [configState, setConfigState] = useState<LaunchConfigState>({
    data: null,
    error: null,
    isLoading: true
  });

  const connection = useConnection();
  const { mutateAsync: switchChainAsync, isPending: isSwitchPending } = useSwitchChain();
  const { mutateAsync: writeContractAsync, isPending: isWritePending } = useWriteContract();

  const walletAddress = connection.address ? getAddress(connection.address) : undefined;
  const isConnected = connection.isConnected && Boolean(walletAddress);
  const isWrongNetwork = isConnected && connection.chainId !== arcTestnet.id;
  const maxMetadataUriLength = parseMaxMetadataUriLength(configState.data);
  const metadataPreview = useMemo(() => getLaunchMetadataPreview(values), [values]);
  const allErrors = useMemo(
    () => getAllErrors(values, maxMetadataUriLength),
    [maxMetadataUriLength, values]
  );
  const hasValidationErrors = Object.keys(allErrors).length > 0;
  const isSubmitting =
    isWritePending || isPendingLaunchPhase(feedback?.phase ?? null) || isSwitchPending;
  const submitDisabledReason = getLaunchSubmitDisabledReason({
    hasValidationErrors,
    hasVerifiedConfig: maxMetadataUriLength !== null,
    isConnected,
    isFactoryPaused: configState.data?.factory.paused ?? false,
    isSubmitting,
    isWrongChain: isWrongNetwork,
    isLoadingConfig: configState.isLoading
  });

  useEffect(() => {
    void refreshLaunchConfig();
  }, []);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    if (isPendingLaunchPhase(feedback.phase)) {
      return;
    }

    setFeedback(null);
    setSuccess(null);
  }, [feedback, values]);

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

  function handleTextChange(field: keyof LaunchFormValues, nextValue: string) {
    setValues((current) => ({
      ...current,
      [field]: nextValue
    }));
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasSubmitted(true);

    if (isSubmitting) {
      return;
    }

    setSuccess(null);
    setFeedback({
      phase: "validating",
      message: "Validating the launch form before preparing the Arc Testnet transaction."
    });

    if (hasValidationErrors || !walletAddress) {
      setFeedback(null);
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

    setFeedback({
      phase: "simulating",
      message: "Simulating the exact createLaunch call before opening the browser wallet."
    });

    try {
      const simulation = await readJson(buildArcLaunchApiPath("simulate"), {
        method: "POST",
        body: JSON.stringify({
          walletAddress,
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
        message: "Confirm the exact LaunchFactory createLaunch transaction in your browser wallet."
      });

      const txHash = (await writeContractAsync({
        abi: launchFactoryAbi,
        address: simulation.request.address,
        account: simulation.request.account,
        args: simulation.request.args,
        chainId: arcTestnet.id,
        functionName: simulation.request.functionName
      })) as `0x${string}`;

      setFeedback({
        phase: "transaction pending",
        message: "Launch transaction submitted. Waiting for the Arc Testnet receipt.",
        txHash
      });

      const receipt = await waitForWalletTransactionReceipt(provider, txHash);

      if (receipt.status !== "0x1") {
        throw new Error("The createLaunch transaction reverted on-chain.");
      }

      const launchCreated = decodeLaunchCreatedEventFromReceipt(
        receipt,
        arcDeployment.factoryAddress
      );

      setSuccess({
        launchId: launchCreated.launchId,
        creator: launchCreated.creator,
        factoryAddress: arcDeployment.factoryAddress,
        poolAddress: launchCreated.launchPool,
        tokenAddress: launchCreated.launchToken,
        txHash
      });
      setFeedback({
        phase: "success",
        message: "Launch created successfully on Arc Testnet.",
        txHash
      });
      void refreshLaunchConfig();
    } catch (error) {
      if (isArcLaunchApiError(error)) {
        setFeedback(getLaunchFeedbackFromApiError(error));
        return;
      }

      setFeedback(
        getLaunchFeedbackFromWalletError(
          error,
          isWalletRejection(error)
            ? "Request rejected in your browser wallet."
            : "Launch creation failed."
        )
      );
    }
  }

  const nameError = getFieldError("name", touchedFields, allErrors, hasSubmitted);
  const symbolError = getFieldError("symbol", touchedFields, allErrors, hasSubmitted);
  const descriptionError = getFieldError("description", touchedFields, allErrors, hasSubmitted);
  const metadataError = getFieldError("metadata", touchedFields, allErrors, hasSubmitted);
  const livePhase =
    feedback?.phase ??
    (configState.isLoading
      ? ("loading configuration" as LaunchFeedbackPhase)
      : !isConnected
        ? ("disconnected" as LaunchFeedbackPhase)
        : isWrongNetwork
          ? ("wrong chain" as LaunchFeedbackPhase)
          : ("idle" as LaunchFeedbackPhase));

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
      <form className="space-y-6" noValidate onSubmit={handleSubmit}>
        <Card className="space-y-8">
          <div className="space-y-3">
            <Link
              className="inline-flex items-center gap-2 rounded-full text-sm font-semibold text-cyan-200 transition hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              href="/"
            >
              <span aria-hidden="true">&larr;</span>
              Back to home
            </Link>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Launch a token
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
                Create a standard LibrARC token through the verified Arc Testnet LaunchFactory with
                your connected browser wallet. This phase submits the exact{" "}
                <code className="rounded bg-white/6 px-2 py-1 text-sm text-cyan-100">
                  createLaunch
                </code>{" "}
                call only.
              </p>
            </div>
          </div>

          <section aria-labelledby="token-details-heading" className="space-y-6">
            <div>
              <h2
                className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70"
                id="token-details-heading"
              >
                Token details
              </h2>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <LaunchField
                className="h-full"
                error={nameError}
                errorId={`${nameId}-error`}
                hint="Required. Validation trims whitespace and requires 2 to 32 characters."
                hintClassName="min-h-12"
                hintId={`${nameId}-hint`}
                htmlFor={nameId}
                label="Token name"
                required
              >
                <input
                  aria-describedby={[`${nameId}-hint`, nameError ? `${nameId}-error` : ""]
                    .filter(Boolean)
                    .join(" ")}
                  aria-invalid={Boolean(nameError)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                  id={nameId}
                  maxLength={64}
                  onBlur={() => markFieldTouched("name")}
                  onChange={(event) => handleTextChange("name", event.target.value)}
                  placeholder="Arc Nova"
                  type="text"
                  value={values.name}
                />
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  {getDisplayValue(values.name).length} / 32
                </p>
              </LaunchField>

              <LaunchField
                className="h-full"
                error={symbolError}
                errorId={`${symbolId}-error`}
                hint="Required. Enter 2 to 10 characters using A-Z and 0-9 only."
                hintClassName="min-h-12"
                hintId={`${symbolId}-hint`}
                htmlFor={symbolId}
                label="Token symbol"
                required
              >
                <input
                  aria-describedby={[`${symbolId}-hint`, symbolError ? `${symbolId}-error` : ""]
                    .filter(Boolean)
                    .join(" ")}
                  aria-invalid={Boolean(symbolError)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                  id={symbolId}
                  maxLength={10}
                  onBlur={() => markFieldTouched("symbol")}
                  onChange={(event) => handleTextChange("symbol", event.target.value)}
                  placeholder="ARCN"
                  spellCheck={false}
                  type="text"
                  value={values.symbol}
                />
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  {getDisplayValue(values.symbol).length} / 10
                </p>
              </LaunchField>
            </div>

            <LaunchField
              error={descriptionError}
              errorId={`${descriptionId}-error`}
              hint="Optional. Empty descriptions are omitted from the metadata JSON."
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
                className="min-h-40 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                id={descriptionId}
                maxLength={500}
                onBlur={() => markFieldTouched("description")}
                onChange={(event) => handleTextChange("description", event.target.value)}
                placeholder="Describe the token in one concise paragraph, or leave this blank."
                value={values.description}
              />
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                {getDisplayValue(values.description).length} / 500
              </p>
            </LaunchField>
          </section>

          <section aria-labelledby="metadata-heading" className="space-y-6">
            <div>
              <h2
                className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70"
                id="metadata-heading"
              >
                Metadata preview
              </h2>
            </div>

            <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/4 p-5">
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
              <pre className="overflow-x-auto rounded-[1.25rem] border border-white/10 bg-slate-950/80 p-4 text-sm leading-6 text-slate-200">
                <code>{metadataPreview.json}</code>
              </pre>
              <p className="text-sm leading-6 text-slate-400">
                The metadata is encoded as a compact <code>data:application/json</code> URI and
                submitted directly to the LaunchFactory. Description is omitted when left empty.
              </p>
              {metadataError ? (
                <p className="text-sm leading-6 text-rose-200" id="metadata-error">
                  {metadataError}
                </p>
              ) : null}
            </div>
          </section>

          <section
            aria-labelledby="launch-action-heading"
            className="space-y-4 border-t border-white/10 pt-8"
          >
            <div>
              <h2
                className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70"
                id="launch-action-heading"
              >
                Final action
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                The server only reads LaunchFactory configuration and simulates the exact
                transaction. The connected browser wallet is the only signer.
              </p>
            </div>

            <Card className="space-y-4 rounded-[1.5rem] border-white/10 bg-white/4">
              <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-400">Launch state</p>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
                    {livePhase}
                  </span>
                </div>
                <p className="mt-2 text-base font-semibold text-white">
                  {!isConnected
                    ? "Wallet not connected"
                    : isWrongNetwork
                      ? `Connected to ${connection.chain?.name ?? "the wrong network"}`
                      : `Connected as ${walletAddress ? formatAddress(walletAddress) : "unknown"}`}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {configState.isLoading
                    ? "Loading the verified Arc Testnet LaunchFactory configuration."
                    : configState.data?.factory.paused
                      ? "Launch creation is currently paused on the verified LaunchFactory."
                      : `Factory ${formatAddress(arcDeployment.factoryAddress)} is ready for createLaunch.`}
                </p>
              </div>

              <p className="text-sm leading-6 text-amber-100">{ARC_TESTNET_NOTICE}</p>

              {!isConnected ? (
                <div className="flex justify-start">
                  <WalletConnectButton />
                </div>
              ) : isWrongNetwork ? (
                <Button
                  disabled={isSwitchPending}
                  onClick={() => {
                    void handleSwitchNetwork();
                  }}
                  type="button"
                >
                  {isSwitchPending ? "Switching..." : "Switch to Arc Testnet"}
                </Button>
              ) : (
                <Button disabled={Boolean(submitDisabledReason)} type="submit">
                  {isSubmitting ? "Launch in progress..." : "Launch Token"}
                </Button>
              )}

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
                  View Factory on ArcScan
                </Link>
              </div>

              {submitDisabledReason ? (
                <p className="text-sm leading-6 text-slate-400">{submitDisabledReason}</p>
              ) : null}
            </Card>
          </section>
        </Card>

        {success ? <SuccessPanel success={success} /> : null}
        <FeedbackCard feedback={feedback ?? configState.error} />
      </form>

      <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <LaunchSummary
          connectedWalletAddress={walletAddress}
          maxMetadataUriLength={maxMetadataUriLength}
          metadataUriByteLength={metadataPreview.uriByteLength}
          paused={configState.data?.factory.paused ?? false}
          values={values}
        />
      </aside>
    </div>
  );
}
