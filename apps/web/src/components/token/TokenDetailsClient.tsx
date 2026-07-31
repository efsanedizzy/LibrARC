"use client";

import Link from "next/link";

import { parseAddress } from "../../lib/arc/config";
import {
  arcDeployment,
  formatCompactAddress,
  formatLaunchTokenAmount,
  formatPercentage,
  formatUsdcAmount,
  useArcExplorerLinks,
  useArcTokenPageData
} from "../../lib/arc/hooks";
import { type ArcTokenApiError } from "../../lib/arc/token-api";
import { Container } from "../layout/Container";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { WalletConnectButton } from "../wallet/WalletConnectButton";

type TokenDetailsClientProps = {
  address: string;
};

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
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]",
        toneClassName
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function DataRow({
  label,
  value,
  valueClassName = ""
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd
        className={["min-w-0 text-right text-sm font-medium text-white", valueClassName].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function ExplorerLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="inline-flex rounded-full text-sm font-semibold text-cyan-200 transition hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </Link>
  );
}

function ErrorCard({
  eyebrow,
  summary,
  details,
  onRetry,
  title
}: {
  eyebrow: string;
  title: string;
  summary: string;
  details: Array<{ label: string; message: string }>;
  onRetry?: () => void;
}) {
  return (
    <Card className="space-y-5 border-rose-300/20 bg-rose-300/10">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-100">{eyebrow}</p>
      <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
      <p className="text-sm leading-7 text-rose-50">{summary}</p>
      {onRetry ? (
        <div className="w-fit">
          <Button onClick={onRetry} size="sm" variant="secondary">
            Retry reads
          </Button>
        </div>
      ) : null}
      <details className="rounded-2xl border border-rose-200/20 bg-slate-950/30 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-rose-100">
          Technical details
        </summary>
        <ul className="mt-3 space-y-3 text-sm leading-6 text-rose-50/90">
          {details.map((detail) => (
            <li key={detail.label}>
              <span className="font-semibold text-rose-100">{detail.label}:</span> {detail.message}
            </li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

function getTerminalErrorPresentation(error: ArcTokenApiError) {
  switch (error.code) {
    case "POOL_NOT_RESOLVED":
      return {
        eyebrow: "Pool resolution error",
        summary: error.message,
        title: "The token is registered, but its pool could not be resolved."
      };
    case "POOL_NOT_REGISTERED":
      return {
        eyebrow: "Pool verification error",
        summary: error.message,
        title: "The resolved pool is not registered in the Arc Testnet factory."
      };
    case "CONTRACT_READ_FAILED":
      return {
        eyebrow: "Read error",
        summary: error.message,
        title: "A contract read failed before the token page could finish loading."
      };
    case "RPC_UNAVAILABLE":
    default:
      return {
        eyebrow: "RPC error",
        summary: error.message,
        title: "Unable to load Arc Testnet token data right now."
      };
  }
}

export function TokenDetailsClient({ address }: TokenDetailsClientProps) {
  const tokenAddress = parseAddress(address);
  const { connection, retry, state } = useArcTokenPageData(address);
  const readyData = state.status === "ready" ? state.data : null;
  const poolAddress = readyData?.pool.address;
  const explorerLinks = useArcExplorerLinks(tokenAddress ?? undefined, poolAddress);

  if (!tokenAddress) {
    return (
      <main className="flex-1 py-16 sm:py-20">
        <Container className="space-y-8">
          <Card className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
              Invalid token address
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              This token route does not contain a valid EVM address.
            </h1>
            <p className="text-base leading-7 text-slate-400">
              Provide a checksummed or lowercase token address such as ` /token/
              {arcDeployment.exampleTokenAddress}` to load verified Arc Testnet data.
            </p>
          </Card>
        </Container>
      </main>
    );
  }

  if (state.status === "error") {
    const presentation = getTerminalErrorPresentation(state.error);
    const isRetriable =
      state.error.code === "RPC_UNAVAILABLE" || state.error.code === "CONTRACT_READ_FAILED";

    return (
      <main className="flex-1 py-16 sm:py-20">
        <Container className="space-y-8">
          <ErrorCard
            details={state.error.details}
            eyebrow={presentation.eyebrow}
            onRetry={isRetriable ? retry : undefined}
            summary={presentation.summary}
            title={presentation.title}
          />
        </Container>
      </main>
    );
  }

  if (state.status === "unregistered") {
    return (
      <main className="flex-1 py-16 sm:py-20">
        <Container className="space-y-8">
          <Card className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-100/80">
              Unregistered token
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              This address is not registered as a LibrARC launch token.
            </h1>
            <p className="text-sm leading-7 text-slate-300">
              The active LaunchFactory at {arcDeployment.factoryAddress} explicitly returned `false`
              for this token address on Arc Testnet.
            </p>
            <div className="flex flex-wrap gap-4">
              {explorerLinks.tokenExplorerUrl ? (
                <ExplorerLink href={explorerLinks.tokenExplorerUrl} label="View token on ArcScan" />
              ) : null}
              <ExplorerLink
                href={explorerLinks.factoryExplorerUrl}
                label="View factory on ArcScan"
              />
            </div>
          </Card>
        </Container>
      </main>
    );
  }

  const isLoading = state.status === "loading";
  const token = readyData?.token;
  const pool = readyData?.pool;
  const deployment = readyData?.deployment;
  const wallet = readyData?.wallet;
  const title = token?.name ?? "LibrARC Token";
  const symbol = token?.symbol ?? "Unavailable";
  const walletTokenBalance =
    wallet?.tokenBalance !== undefined
      ? formatLaunchTokenAmount(BigInt(wallet.tokenBalance))
      : connection.isConnected
        ? isLoading
          ? "Loading..."
          : "Unavailable"
        : "Connect wallet";
  const walletUsdcBalance =
    wallet?.usdcBalance !== undefined
      ? `${formatUsdcAmount(BigInt(wallet.usdcBalance))} USDC`
      : connection.isConnected
        ? isLoading
          ? "Loading..."
          : "Unavailable"
        : "Connect wallet";
  const pageStatusTone =
    pool?.allTradingPaused || pool?.buysPaused
      ? "warning"
      : pool?.statusLabel === "Active"
        ? "success"
        : "neutral";
  const warnings = readyData?.warnings ?? [];

  return (
    <main className="flex-1 py-16 sm:py-20">
      <Container className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
              Arc Testnet token
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {isLoading ? "Loading token details..." : title}
              </h1>
              <StatusBadge tone={pageStatusTone}>
                {pool?.statusLabel ?? (isLoading ? "Loading" : "Registered")}
              </StatusBadge>
            </div>
            <p className="mt-4 break-all text-sm leading-6 text-slate-400">{tokenAddress}</p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Live read-only Arc Testnet data for the selected LibrARC token, including pool
              reserves, graduation progress, trading state, and connected-wallet balances.
            </p>
          </div>

          <div className="lg:max-w-sm">
            {connection.isConnected ? (
              <Card className="space-y-3 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                  Connected wallet
                </p>
                <p className="text-sm text-slate-300">
                  {wallet?.address ? formatCompactAddress(wallet.address) : "Wallet connected"}
                </p>
                <p className="text-xs leading-6 text-slate-400">
                  Token balance: {walletTokenBalance}
                </p>
                <p className="text-xs leading-6 text-slate-400">
                  USDC balance: {walletUsdcBalance}
                </p>
              </Card>
            ) : (
              <Card className="space-y-4 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                  Wallet connection
                </p>
                <p className="text-sm leading-6 text-slate-300">
                  Connect a browser wallet to view your Arc Testnet USDC and token balances here.
                </p>
                <div className="w-fit">
                  <WalletConnectButton />
                </div>
              </Card>
            )}
          </div>
        </div>

        {warnings.length > 0 ? (
          <Card className="space-y-4 border-rose-300/20 bg-rose-300/10">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-rose-100">
              RPC error
            </p>
            <p className="text-sm leading-6 text-rose-50">
              Some optional Arc Testnet reads failed. Retry to refresh the latest on-chain data.
            </p>
            <div className="w-fit">
              <Button onClick={retry} size="sm" variant="secondary">
                Retry reads
              </Button>
            </div>
            <details className="rounded-2xl border border-rose-200/20 bg-slate-950/30 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-rose-100">
                Technical details
              </summary>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-rose-50/90">
                {warnings.map((warning) => (
                  <li key={warning.label}>
                    <span className="font-semibold text-rose-100">{warning.label}:</span>{" "}
                    {warning.message}
                  </li>
                ))}
              </ul>
            </details>
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
          <div className="space-y-6">
            <Card className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                    Token overview
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {token?.name
                      ? `${token.name} (${symbol})`
                      : isLoading
                        ? "Waiting for token reads"
                        : "Unavailable"}
                  </h2>
                </div>
                {explorerLinks.tokenExplorerUrl ? (
                  <ExplorerLink href={explorerLinks.tokenExplorerUrl} label="Token explorer" />
                ) : null}
              </div>

              <dl className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">Symbol</dt>
                  <dd className="mt-3 text-xl font-semibold text-white">
                    {token?.symbol ?? (isLoading ? "Loading..." : "Unavailable")}
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Total supply
                  </dt>
                  <dd className="mt-3 text-xl font-semibold text-white">
                    {token?.totalSupply
                      ? formatLaunchTokenAmount(BigInt(token.totalSupply))
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"}
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Wallet token balance
                  </dt>
                  <dd className="mt-3 text-xl font-semibold text-white">{walletTokenBalance}</dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Wallet USDC balance
                  </dt>
                  <dd className="mt-3 text-xl font-semibold text-white">{walletUsdcBalance}</dd>
                </div>
              </dl>
            </Card>

            <Card className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                    Pool reserves
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    Live LaunchPool accounting
                  </h2>
                </div>
                {explorerLinks.poolExplorerUrl ? (
                  <ExplorerLink href={explorerLinks.poolExplorerUrl} label="Pool explorer" />
                ) : null}
              </div>

              <dl className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Real USDC reserve
                  </dt>
                  <dd className="mt-3 text-xl font-semibold text-white">
                    {pool?.curveState
                      ? `${formatUsdcAmount(BigInt(pool.curveState.realUsdcReserve))} USDC`
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"}
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Real token reserve
                  </dt>
                  <dd className="mt-3 text-xl font-semibold text-white">
                    {pool?.curveState
                      ? formatLaunchTokenAmount(BigInt(pool.curveState.realTokenReserve))
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"}
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <dt className="text-xs uppercase tracking-[0.24em] text-slate-500">
                    Accrued protocol fees
                  </dt>
                  <dd className="mt-3 text-xl font-semibold text-white">
                    {pool?.curveState
                      ? `${formatUsdcAmount(BigInt(pool.curveState.accruedProtocolFees))} USDC`
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"}
                  </dd>
                </div>
              </dl>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium text-white">Graduation progress</p>
                  <p className="text-sm font-semibold text-cyan-100">
                    {pool?.graduationProgress !== undefined
                      ? formatPercentage(pool.graduationProgress)
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"}
                  </p>
                </div>
                <div aria-hidden="true" className="h-3 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.85),rgba(103,232,249,1))] transition-[width] duration-300"
                    style={{ width: `${pool?.graduationProgress ?? 0}%` }}
                  />
                </div>
                <p className="text-xs leading-6 text-slate-400">
                  Remaining capacity:{" "}
                  {pool?.remainingGraduationCapacity !== undefined
                    ? `${formatUsdcAmount(BigInt(pool.remainingGraduationCapacity))} USDC`
                    : isLoading
                      ? "Loading..."
                      : "Unavailable"}
                </p>
              </div>
            </Card>
          </div>

          <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
            <Card className="space-y-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                  Trading state
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Read-only execution status
                </h2>
              </div>

              <dl className="space-y-3">
                <DataRow
                  label="Pool status"
                  value={pool?.statusLabel ?? (isLoading ? "Loading..." : "Unavailable")}
                />
                <DataRow
                  label="Can buy"
                  value={
                    pool?.canBuy !== undefined
                      ? pool.canBuy
                        ? "Yes"
                        : "No"
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"
                  }
                />
                <DataRow
                  label="Can sell"
                  value={
                    pool?.canSell !== undefined
                      ? pool.canSell
                        ? "Yes"
                        : "No"
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"
                  }
                />
                <DataRow
                  label="Buys paused"
                  value={
                    pool?.buysPaused !== undefined
                      ? pool.buysPaused
                        ? "Yes"
                        : "No"
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"
                  }
                />
                <DataRow
                  label="All trading paused"
                  value={
                    pool?.allTradingPaused !== undefined
                      ? pool.allTradingPaused
                        ? "Yes"
                        : "No"
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"
                  }
                />
                <DataRow
                  label="Factory launch creation paused"
                  value={
                    deployment?.paused !== undefined
                      ? deployment.paused
                        ? "Yes"
                        : "No"
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"
                  }
                />
              </dl>
            </Card>

            <Card className="space-y-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                  Deployment info
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                  Verified Arc Testnet contracts
                </h2>
              </div>

              <dl className="space-y-3">
                <DataRow
                  label="Launch count"
                  value={deployment?.launchCount ?? (isLoading ? "Loading..." : "Unavailable")}
                />
                <DataRow
                  label="Factory"
                  value={formatCompactAddress(arcDeployment.factoryAddress)}
                  valueClassName="truncate"
                />
                <DataRow
                  label="Pool"
                  value={
                    poolAddress
                      ? formatCompactAddress(poolAddress)
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"
                  }
                  valueClassName="truncate"
                />
                <DataRow
                  label="FeeVault treasury"
                  value={
                    deployment?.treasury
                      ? formatCompactAddress(deployment.treasury)
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"
                  }
                  valueClassName="truncate"
                />
                <DataRow
                  label="Quote asset"
                  value={formatCompactAddress(arcDeployment.usdcAddress)}
                  valueClassName="truncate"
                />
                <DataRow
                  label="Pool quote asset"
                  value={
                    pool?.quoteAsset
                      ? formatCompactAddress(pool.quoteAsset)
                      : isLoading
                        ? "Loading..."
                        : "Unavailable"
                  }
                  valueClassName="truncate"
                />
                <DataRow
                  label="Arc Testnet staging adapter - not a DEX"
                  value={formatCompactAddress(arcDeployment.stagingAdapterAddress)}
                  valueClassName="truncate"
                />
              </dl>

              <div className="flex flex-wrap gap-4">
                <ExplorerLink href={explorerLinks.factoryExplorerUrl} label="Factory explorer" />
                {explorerLinks.poolExplorerUrl ? (
                  <ExplorerLink href={explorerLinks.poolExplorerUrl} label="Pool explorer" />
                ) : null}
                {explorerLinks.tokenExplorerUrl ? (
                  <ExplorerLink href={explorerLinks.tokenExplorerUrl} label="Token explorer" />
                ) : null}
                <ExplorerLink
                  href={explorerLinks.stagingAdapterExplorerUrl}
                  label="Adapter explorer"
                />
              </div>
            </Card>
          </div>
        </div>
      </Container>
    </main>
  );
}
