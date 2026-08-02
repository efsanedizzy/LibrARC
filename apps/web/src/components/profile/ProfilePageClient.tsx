"use client";

import Link from "next/link";
import { useConnection } from "wagmi";
import { useEffect, useMemo, useState } from "react";

import {
  arcDeployment,
  formatCompactAddress,
  formatLaunchTokenAmount,
  formatPercentage,
  formatUsdcAmount,
  useArcProfilePageData
} from "../../lib/arc/hooks";
import { arcTestnet } from "../../lib/chains/arc-testnet";
import { type ArcProfileLaunch, type ArcProfileSort } from "../../lib/arc/profile-api";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Container } from "../layout/Container";
import { buildProfileRequestKey, resolveProfileWalletState } from "./state";

const DEFAULT_PAGE_SIZE = 12;

function LoadingCard() {
  return (
    <Card className="space-y-4 animate-pulse">
      <div className="h-4 w-24 rounded-full bg-white/10" />
      <div className="h-8 w-52 rounded-full bg-white/10" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 rounded-[1.25rem] bg-white/8" />
        <div className="h-24 rounded-[1.25rem] bg-white/8" />
      </div>
      <div className="h-11 w-32 rounded-full bg-white/10" />
    </Card>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="space-y-3 p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-white">{value}</p>
    </Card>
  );
}

function UnavailableMetricCard({ label }: { label: string }) {
  return <MetricCard label={label} value="Unavailable" />;
}

function LaunchStatusBadge({ launch }: { launch: ArcProfileLaunch }) {
  const toneClassName =
    launch.poolStatus === 1 && launch.canBuy !== false && launch.canSell !== false
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : launch.poolStatus === 2 || launch.canBuy === false || launch.canSell === false
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : "border-slate-400/20 bg-slate-400/10 text-slate-200";

  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]",
        toneClassName
      ].join(" ")}
    >
      {launch.poolStatusLabel ?? "Unavailable"}
    </span>
  );
}

function LaunchCard({ launch }: { launch: ArcProfileLaunch }) {
  return (
    <Card className="flex h-full flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
            Launch #{launch.launchId}
          </p>
          <h3 className="mt-3 break-words text-2xl font-semibold tracking-tight text-white">
            {launch.name ?? "Unavailable token"}
          </h3>
          <p className="mt-2 break-words text-sm text-slate-400">
            ${launch.symbol ?? "UNKNOWN"} • {formatCompactAddress(launch.tokenAddress)}
          </p>
        </div>
        <LaunchStatusBadge launch={launch} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Wallet token balance</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {launch.walletTokenBalance
              ? formatLaunchTokenAmount(BigInt(launch.walletTokenBalance))
              : "Unavailable"}
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Real USDC reserve</p>
          <p className="mt-2 text-sm font-semibold text-white">
            {launch.realUsdcReserve
              ? `${formatUsdcAmount(BigInt(launch.realUsdcReserve))} USDC`
              : "Unavailable"}
          </p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1.25rem] border border-white/10 bg-white/4 p-4">
          <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Buy availability</dt>
          <dd className="mt-2 text-sm font-semibold text-white">
            {launch.canBuy === undefined ? "Unavailable" : launch.canBuy ? "Available" : "Paused"}
          </dd>
        </div>
        <div className="rounded-[1.25rem] border border-white/10 bg-white/4 p-4">
          <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Sell availability</dt>
          <dd className="mt-2 text-sm font-semibold text-white">
            {launch.canSell === undefined ? "Unavailable" : launch.canSell ? "Available" : "Paused"}
          </dd>
        </div>
      </dl>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-white">Graduation progress</p>
          <p className="text-sm font-semibold text-cyan-100">
            {launch.graduationProgress !== undefined
              ? formatPercentage(launch.graduationProgress)
              : "Unavailable"}
          </p>
        </div>
        <div aria-hidden="true" className="h-3 overflow-hidden rounded-full bg-white/8">
          <div
            className="h-full rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.85),rgba(103,232,249,1))] transition-[width] duration-300"
            style={{ width: `${launch.graduationProgress ?? 0}%` }}
          />
        </div>
        <p className="text-xs leading-6 text-slate-400">
          Remaining capacity:{" "}
          {launch.remainingGraduationCapacity
            ? `${formatUsdcAmount(BigInt(launch.remainingGraduationCapacity))} USDC`
            : "Unavailable"}
        </p>
      </div>

      {launch.warnings.length > 0 ? (
        <div className="rounded-[1.25rem] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
          Some optional reads for this launch were unavailable.
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-3">
        <Button href={launch.tokenPageUrl}>Open token page</Button>
        <Button href={launch.tokenExplorerUrl} rel="noreferrer" target="_blank" variant="secondary">
          Token explorer
        </Button>
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-cyan-200 transition hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          href={launch.poolExplorerUrl}
          rel="noreferrer"
          target="_blank"
        >
          Pool explorer
        </Link>
        {launch.transactionExplorerUrl ? (
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-cyan-200 transition hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            href={launch.transactionExplorerUrl}
            rel="noreferrer"
            target="_blank"
          >
            Creation tx
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

function WrongNetworkNotice({ currentNetwork }: { currentNetwork: string }) {
  return (
    <Card className="space-y-3 border-amber-300/20 bg-amber-300/10">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-100">
        Wrong network
      </p>
      <p className="text-sm leading-6 text-amber-50">
        Your wallet is connected to {currentNetwork}. Public profile reads still come from Arc
        Testnet, but wallet actions should be switched to Arc Testnet first.
      </p>
    </Card>
  );
}

function ErrorState({
  details,
  message,
  onRetry
}: {
  details: Array<{ label: string; message: string }>;
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card className="space-y-4 border-rose-300/20 bg-rose-300/10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-100/80">
          RPC unavailable
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{message}</h2>
      </div>
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
      <div className="w-fit">
        <Button onClick={onRetry}>Retry reads</Button>
      </div>
    </Card>
  );
}

export function ProfilePageClient() {
  const connection = useConnection();
  const [sort, setSort] = useState<ArcProfileSort>("newest");
  const [page, setPage] = useState(1);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const walletState = resolveProfileWalletState({
    address: connection.address,
    chainId: connection.chainId,
    isConnected: connection.isConnected
  });
  const walletAddress = walletState.mode === "connected" ? walletState.address : null;
  const requestKey = useMemo(
    () =>
      walletAddress
        ? buildProfileRequestKey({
            walletAddress,
            page,
            limit: DEFAULT_PAGE_SIZE,
            sort
          })
        : null,
    [page, sort, walletAddress]
  );
  const { retry, state } = useArcProfilePageData({
    limit: DEFAULT_PAGE_SIZE,
    page,
    sort,
    walletAddress
  });

  useEffect(() => {
    setPage(1);
    setCopiedAddress(false);
  }, [walletAddress]);

  async function handleCopyAddress() {
    if (!walletAddress || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopiedAddress(true);
      window.setTimeout(() => setCopiedAddress(false), 1_500);
    } catch {
      setCopiedAddress(false);
    }
  }

  if (walletState.mode === "disconnected") {
    return (
      <main className="flex-1 py-16 sm:py-20">
        <Container className="space-y-8">
          <Card className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
              Creator profile
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Connect your wallet to load your Arc Testnet creator profile.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300">
              LibrARC will show your real wallet address, Arc USDC balance, and launches created by
              the connected browser wallet. No mock balances or placeholder launches are shown here.
            </p>
            <div className="w-fit">
              <WalletConnectButton />
            </div>
          </Card>
        </Container>
      </main>
    );
  }

  if (walletState.mode === "invalid-wallet") {
    return (
      <main className="flex-1 py-16 sm:py-20">
        <Container>
          <Card className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-100/80">
              Invalid wallet address
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              The connected wallet address could not be validated.
            </h1>
            <p className="text-sm leading-7 text-slate-300">{walletState.rawAddress}</p>
          </Card>
        </Container>
      </main>
    );
  }

  const isLoading = state.status === "loading";
  const readyData = state.status === "ready" ? state.data : null;
  const launches = readyData?.launches ?? [];
  const isEmpty = readyData !== null && readyData.totalCreatedLaunches === 0;
  const currentNetworkLabel = connection.chain?.name ?? "Unknown network";

  return (
    <main className="flex-1 py-16 sm:py-20">
      <Container className="space-y-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
              Arc creator profile
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Real wallet and launch data from Arc Testnet.
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Your connected browser wallet drives this read-only profile. Launch discovery is
              resolved from the verified Arc Testnet LaunchFactory and canonical on-chain token and
              pool reads.
            </p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/4 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Request key</p>
            <p className="mt-2 text-sm font-medium text-white">{requestKey ?? "Disconnected"}</p>
          </div>
        </div>

        {walletState.isWrongNetwork ? (
          <WrongNetworkNotice currentNetwork={currentNetworkLabel} />
        ) : null}

        <Card className="space-y-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Connected wallet</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                {formatCompactAddress(walletState.address)}
              </h2>
              <p className="mt-2 break-all font-mono text-sm text-slate-300">
                {walletState.address}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleCopyAddress} variant="secondary">
                {copiedAddress ? "Copied" : "Copy address"}
              </Button>
              <Button
                href={`${arcDeployment.explorerUrl}/address/${walletState.address}`}
                rel="noreferrer"
                target="_blank"
                variant="secondary"
              >
                View on ArcScan
              </Button>
            </div>
          </div>

          <dl className="grid gap-4 lg:grid-cols-4">
            <div className="rounded-[1.25rem] border border-white/10 bg-white/4 p-4">
              <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">Network</dt>
              <dd className="mt-3 text-lg font-semibold text-white">{arcTestnet.name}</dd>
              <p className="mt-2 text-xs text-slate-400">Wallet network: {currentNetworkLabel}</p>
            </div>
            <div className="rounded-[1.25rem] border border-white/10 bg-white/4 p-4">
              <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">
                Arc USDC balance
              </dt>
              <dd className="mt-3 text-lg font-semibold text-white">
                {readyData?.usdcBalance !== undefined
                  ? `${formatUsdcAmount(BigInt(readyData.usdcBalance))} USDC`
                  : isLoading
                    ? "Loading..."
                    : "Unavailable"}
              </dd>
            </div>
            <div className="rounded-[1.25rem] border border-white/10 bg-white/4 p-4">
              <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">
                Profile address
              </dt>
              <dd className="mt-3 text-lg font-semibold text-white">
                {formatCompactAddress(walletState.address)}
              </dd>
            </div>
            <div className="rounded-[1.25rem] border border-white/10 bg-white/4 p-4">
              <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">LaunchFactory</dt>
              <dd className="mt-3 text-lg font-semibold text-white">
                {formatCompactAddress(arcDeployment.factoryAddress)}
              </dd>
            </div>
          </dl>
        </Card>

        {state.status === "error" ? (
          <ErrorState details={state.error.details} message={state.error.message} onRetry={retry} />
        ) : null}

        {readyData?.warnings.length ? (
          <Card className="space-y-4 border-amber-300/20 bg-amber-300/10">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-100">
              Partial data warning
            </p>
            <p className="text-sm leading-6 text-amber-50">
              Some optional profile reads were unavailable, so launch counts or balances may be
              incomplete until the next successful refresh.
            </p>
            <details className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-white">
                Technical details
              </summary>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                {readyData.warnings.map((warning) => (
                  <li key={`${warning.label}-${warning.message}`}>
                    <span className="font-semibold text-white">{warning.label}:</span>{" "}
                    {warning.message}
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }, (_, index) => <LoadingCard key={index} />)
          ) : state.status === "error" ? (
            <>
              <UnavailableMetricCard label="Total launches" />
              <UnavailableMetricCard label="Active" />
              <UnavailableMetricCard label="Graduation pending" />
              <UnavailableMetricCard label="Graduated" />
            </>
          ) : (
            <>
              <MetricCard
                label="Total launches"
                value={String(readyData?.totalCreatedLaunches ?? 0)}
              />
              <MetricCard label="Active" value={String(readyData?.activeLaunchCount ?? 0)} />
              <MetricCard
                label="Graduation pending"
                value={String(readyData?.graduationPendingLaunchCount ?? 0)}
              />
              <MetricCard label="Graduated" value={String(readyData?.graduatedLaunchCount ?? 0)} />
            </>
          )}
        </div>

        <Card className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                My launches
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Launches created by the connected wallet
              </h2>
            </div>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-white">Sort</span>
              <select
                className="min-h-11 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/45"
                onChange={(event) => {
                  setSort(event.target.value as ArcProfileSort);
                  setPage(1);
                }}
                value={sort}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </label>
          </div>

          {isLoading ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <LoadingCard key={index} />
              ))}
            </div>
          ) : null}

          {isEmpty ? (
            <Card className="space-y-4 rounded-[1.5rem] border-white/10 bg-white/4">
              <h3 className="text-2xl font-semibold tracking-tight text-white">
                This wallet has not created a LibrARC launch yet.
              </h3>
              <p className="text-sm leading-6 text-slate-400">
                When this connected wallet creates a launch on Arc Testnet, it will appear here
                automatically with on-chain balances and pool state.
              </p>
            </Card>
          ) : null}

          {readyData && launches.length > 0 ? (
            <>
              <div className="grid gap-5 lg:grid-cols-2">
                {launches.map((launch) => (
                  <LaunchCard key={`${launch.launchId}-${launch.tokenAddress}`} launch={launch} />
                ))}
              </div>

              <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-400">
                  Page {readyData.page} of {Math.max(readyData.totalPages, 1)}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={!readyData.hasPreviousPage}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    variant="secondary"
                  >
                    Previous
                  </Button>
                  <Button
                    disabled={!readyData.hasNextPage}
                    onClick={() => setPage((current) => current + 1)}
                    variant="secondary"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </Card>
      </Container>
    </main>
  );
}
