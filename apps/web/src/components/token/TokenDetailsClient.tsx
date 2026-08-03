"use client";

import Link from "next/link";
import { useState } from "react";

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
import { type ArcTokenApiError, type ArcTokenApiSuccess } from "../../lib/arc/token-api";
import { Container } from "../layout/Container";
import { Button } from "../ui/Button";
import { TokenTradePanel } from "./TokenTradePanel";

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

function ExplorerLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="inline-flex rounded-full text-sm font-semibold text-cyan-200 transition hover:text-cyan-100"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </Link>
  );
}

function SectionCard({
  children,
  className = ""
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={["surface-panel rounded-[var(--radius-lg)] p-5 sm:p-6", className].join(" ")}
    >
      {children}
    </section>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-muted rounded-[var(--radius-md)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-faint)]">
        {label}
      </p>
      <p className="mt-3 text-xl font-semibold text-white tabular-nums">{value}</p>
      {hint ? <p className="mt-2 text-xs leading-6 text-[var(--text-faint)]">{hint}</p> : null}
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-sm text-[var(--text-muted)]">{label}</dt>
      <dd className="text-right text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function TokenAvatar({ symbol }: { symbol: string }) {
  const text = symbol.trim().slice(0, 2).toUpperCase() || "AR";

  return (
    <span
      aria-hidden="true"
      className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] border border-cyan-200/15 bg-[radial-gradient(circle_at_30%_30%,rgba(103,232,249,0.92),rgba(8,145,178,0.52)_62%,rgba(4,8,22,0.85)_100%)] text-lg font-black tracking-[0.12em] text-slate-950 shadow-[0_0_32px_rgba(34,211,238,0.12)]"
    >
      {text}
    </span>
  );
}

function ErrorCard({
  eyebrow,
  title,
  summary,
  details,
  onRetry
}: {
  eyebrow: string;
  title: string;
  summary: string;
  details: Array<{ label: string; message: string }>;
  onRetry?: () => void;
}) {
  return (
    <SectionCard className="border-rose-300/18 bg-rose-300/8">
      <div className="space-y-5">
        <p className="eyebrow text-rose-100/80">{eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">{summary}</p>
        {onRetry ? (
          <div className="w-fit">
            <Button onClick={onRetry} size="sm" variant="secondary">
              Retry reads
            </Button>
          </div>
        ) : null}
        <details className="surface-muted rounded-[var(--radius-md)] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white">
            Technical details
          </summary>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
            {details.map((detail) => (
              <li key={`${detail.label}-${detail.message}`}>
                <span className="font-semibold text-white">{detail.label}:</span> {detail.message}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </SectionCard>
  );
}

function TokenHeaderSkeleton() {
  return (
    <SectionCard className="animate-pulse">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-[1.4rem] bg-white/8" />
          <div className="space-y-3">
            <div className="h-4 w-28 rounded-full bg-white/8" />
            <div className="h-10 w-64 rounded-full bg-white/8" />
            <div className="h-4 w-40 rounded-full bg-white/8" />
          </div>
        </div>
        <div className="h-10 w-36 rounded-full bg-white/8" />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-24 rounded-[var(--radius-md)] bg-white/6" key={index} />
        ))}
      </div>
    </SectionCard>
  );
}

function DetailSkeletonSection() {
  return (
    <SectionCard className="animate-pulse">
      <div className="space-y-4">
        <div className="h-4 w-32 rounded-full bg-white/8" />
        <div className="h-8 w-48 rounded-full bg-white/8" />
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-24 rounded-[var(--radius-md)] bg-white/6" key={index} />
        ))}
      </div>
    </SectionCard>
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
    case "POOL_TOKEN_MISMATCH":
      return {
        eyebrow: "Pool validation error",
        summary: error.message,
        title: "The resolved pool does not match the requested token."
      };
    case "INVALID_QUOTE_ASSET":
      return {
        eyebrow: "Quote asset error",
        summary: error.message,
        title: "The resolved pool is not paired with the verified Arc USDC contract."
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

function formatTradeState(
  value: boolean | undefined,
  positive: string,
  negative: string,
  loading: boolean
) {
  if (value === undefined) {
    return loading ? "Loading..." : "Unavailable";
  }

  return value ? positive : negative;
}

function TokenIdentitySection({
  isLoading,
  tokenAddress,
  token,
  pool,
  walletTokenBalance,
  walletUsdcBalance,
  tokenExplorerUrl,
  poolExplorerUrl
}: {
  isLoading: boolean;
  tokenAddress: `0x${string}`;
  token: ArcTokenApiSuccess["token"] | undefined;
  pool: ArcTokenApiSuccess["pool"] | undefined;
  walletTokenBalance: string;
  walletUsdcBalance: string;
  tokenExplorerUrl?: string;
  poolExplorerUrl?: string;
}) {
  const [copied, setCopied] = useState(false);
  const symbol = token?.symbol ?? "ARC";
  const statusTone =
    pool?.allTradingPaused || pool?.buysPaused
      ? "warning"
      : pool?.statusLabel === "Active"
        ? "success"
        : "neutral";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(tokenAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <SectionCard>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <TokenAvatar symbol={symbol} />
          <div className="min-w-0">
            <p className="eyebrow">Arc Testnet token</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {isLoading ? "Loading token details..." : (token?.name ?? "LibrARC Token")}
              </h1>
              <StatusBadge tone={statusTone}>
                {pool?.statusLabel ?? (isLoading ? "Loading" : "Registered")}
              </StatusBadge>
            </div>
            <p className="mt-3 text-base font-medium text-[var(--text-secondary)]">
              {token?.symbol ?? (isLoading ? "Loading..." : "Unavailable")}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span
                className="max-w-full truncate rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-sm text-[var(--text-secondary)]"
                title={tokenAddress}
              >
                {formatCompactAddress(tokenAddress)}
              </span>
              <button
                className="rounded-full border border-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:border-cyan-300/35 hover:text-cyan-100"
                onClick={() => {
                  void handleCopy();
                }}
                type="button"
              >
                {copied ? "Copied" : "Copy address"}
              </button>
              {tokenExplorerUrl ? (
                <ExplorerLink href={tokenExplorerUrl} label="Token explorer" />
              ) : null}
              {poolExplorerUrl ? (
                <ExplorerLink href={poolExplorerUrl} label="Pool explorer" />
              ) : null}
            </div>
          </div>
        </div>

        <div className="surface-muted rounded-[var(--radius-md)] px-4 py-4 lg:max-w-xs">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-faint)]">
            Testnet disclosure
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Arc Testnet only - test assets have no monetary value.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hint="Canonical token supply"
          label="Total supply"
          value={
            token?.totalSupply
              ? formatLaunchTokenAmount(BigInt(token.totalSupply))
              : isLoading
                ? "Loading..."
                : "Unavailable"
          }
        />
        <StatCard hint="Connected wallet" label="Token balance" value={walletTokenBalance} />
        <StatCard hint="Connected wallet" label="USDC balance" value={walletUsdcBalance} />
        <StatCard
          hint="Readable pool state"
          label="Trading status"
          value={pool?.statusLabel ?? (isLoading ? "Loading..." : "Unavailable")}
        />
      </div>
    </SectionCard>
  );
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
          <ErrorCard
            details={[
              {
                label: "Route address",
                message: "The provided route segment is not a valid EVM address."
              }
            ]}
            eyebrow="Invalid token address"
            summary={`Provide a valid token address such as /token/${arcDeployment.exampleTokenAddress}.`}
            title="This token route does not contain a valid EVM address."
          />
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
          <SectionCard className="border-amber-300/18 bg-amber-300/8">
            <div className="space-y-5">
              <p className="eyebrow text-amber-100/80">Unregistered token</p>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                This address is not registered as a LibrARC launch token.
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
                The active LaunchFactory explicitly returned false for this token address on Arc
                Testnet, so the trading interface is intentionally unavailable here.
              </p>
              <div className="flex flex-wrap gap-3">
                {explorerLinks.tokenExplorerUrl ? (
                  <ExplorerLink
                    href={explorerLinks.tokenExplorerUrl}
                    label="View token on ArcScan"
                  />
                ) : null}
                <ExplorerLink href={explorerLinks.factoryExplorerUrl} label="Factory explorer" />
                <Button href="/">Back to Discover</Button>
              </div>
            </div>
          </SectionCard>
        </Container>
      </main>
    );
  }

  const isLoading = state.status === "loading";
  const token = readyData?.token;
  const pool = readyData?.pool;
  const deployment = readyData?.deployment;
  const wallet = readyData?.wallet;
  const warnings = readyData?.warnings ?? [];
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
  const graduationProgress = Math.max(0, Math.min(100, pool?.graduationProgress ?? 0));

  return (
    <main className="flex-1 py-14 sm:py-18">
      <Container className="space-y-6 sm:space-y-8">
        {isLoading && !readyData ? (
          <>
            <TokenHeaderSkeleton />
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
              <div className="order-2 space-y-6 xl:order-1">
                <DetailSkeletonSection />
                <DetailSkeletonSection />
              </div>
              <div className="order-1 xl:order-2">
                <TokenTradePanel
                  data={null}
                  isPageLoading={true}
                  onRefresh={retry}
                  tokenAddress={tokenAddress}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <TokenIdentitySection
              isLoading={isLoading}
              pool={pool}
              poolExplorerUrl={explorerLinks.poolExplorerUrl}
              token={token}
              tokenAddress={tokenAddress}
              tokenExplorerUrl={explorerLinks.tokenExplorerUrl}
              walletTokenBalance={walletTokenBalance}
              walletUsdcBalance={walletUsdcBalance}
            />

            {warnings.length > 0 ? (
              <SectionCard className="border-amber-300/18 bg-amber-300/8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="eyebrow text-amber-100/80">Partial read warning</p>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
                      Some optional Arc Testnet reads were unavailable. Core token validation and
                      trading state still loaded.
                    </p>
                  </div>
                  <div className="w-fit">
                    <Button onClick={retry} size="sm" variant="secondary">
                      Retry reads
                    </Button>
                  </div>
                </div>
                <details className="surface-muted mt-4 rounded-[var(--radius-md)] p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-white">
                    Technical details
                  </summary>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {warnings.map((warning) => (
                      <li key={`${warning.label}-${warning.message}`}>
                        <span className="font-semibold text-white">{warning.label}:</span>{" "}
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                </details>
              </SectionCard>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
              <div className="order-1 xl:order-2 xl:sticky xl:top-28 xl:self-start">
                <TokenTradePanel
                  data={readyData}
                  isPageLoading={isLoading}
                  onRefresh={retry}
                  tokenAddress={tokenAddress}
                />
              </div>

              <div className="order-2 space-y-6 xl:order-1">
                <SectionCard>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="eyebrow">Token overview</p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                        Cleaner canonical token data
                      </h2>
                    </div>
                    {explorerLinks.tokenExplorerUrl ? (
                      <ExplorerLink href={explorerLinks.tokenExplorerUrl} label="Token explorer" />
                    ) : null}
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                      hint="Symbol used in trading"
                      label="Symbol"
                      value={token?.symbol ?? (isLoading ? "Loading..." : "Unavailable")}
                    />
                    <StatCard
                      hint="Total fixed launch supply"
                      label="Total supply"
                      value={
                        token?.totalSupply
                          ? formatLaunchTokenAmount(BigInt(token.totalSupply))
                          : isLoading
                            ? "Loading..."
                            : "Unavailable"
                      }
                    />
                    <StatCard
                      hint="Wallet token balance"
                      label="Token balance"
                      value={walletTokenBalance}
                    />
                    <StatCard
                      hint="Wallet USDC balance"
                      label="USDC balance"
                      value={walletUsdcBalance}
                    />
                  </div>
                </SectionCard>

                <SectionCard>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="eyebrow">Pool and graduation</p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                        Reserve depth and graduation readiness
                      </h2>
                    </div>
                    {explorerLinks.poolExplorerUrl ? (
                      <ExplorerLink href={explorerLinks.poolExplorerUrl} label="Pool explorer" />
                    ) : null}
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <StatCard
                      label="Real USDC reserve"
                      value={
                        pool?.curveState
                          ? `${formatUsdcAmount(BigInt(pool.curveState.realUsdcReserve))} USDC`
                          : isLoading
                            ? "Loading..."
                            : "Unavailable"
                      }
                    />
                    <StatCard
                      label="Real token reserve"
                      value={
                        pool?.curveState
                          ? formatLaunchTokenAmount(BigInt(pool.curveState.realTokenReserve))
                          : isLoading
                            ? "Loading..."
                            : "Unavailable"
                      }
                    />
                    <StatCard
                      label="Accrued protocol fees"
                      value={
                        pool?.curveState
                          ? `${formatUsdcAmount(BigInt(pool.curveState.accruedProtocolFees))} USDC`
                          : isLoading
                            ? "Loading..."
                            : "Unavailable"
                      }
                    />
                  </div>

                  <div className="surface-muted mt-6 rounded-[var(--radius-md)] p-4 sm:p-5">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-white">Graduation progress</p>
                        <p className="mt-2 text-3xl font-semibold tabular-nums text-white">
                          {pool?.graduationProgress !== undefined
                            ? formatPercentage(graduationProgress)
                            : isLoading
                              ? "Loading..."
                              : "Unavailable"}
                        </p>
                      </div>
                      <p className="max-w-xs text-right text-xs leading-6 text-[var(--text-faint)]">
                        Remaining capacity:{" "}
                        {pool?.remainingGraduationCapacity !== undefined
                          ? `${formatUsdcAmount(BigInt(pool.remainingGraduationCapacity))} USDC`
                          : isLoading
                            ? "Loading..."
                            : "Unavailable"}
                      </p>
                    </div>
                    <div
                      aria-label={`Graduation progress ${formatPercentage(graduationProgress)}`}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={graduationProgress}
                      className="mt-4 progress-track"
                      role="progressbar"
                    >
                      <span className="progress-fill" style={{ width: `${graduationProgress}%` }} />
                    </div>
                  </div>
                </SectionCard>

                <SectionCard>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="eyebrow">Trading state</p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                        Readable pool availability
                      </h2>
                    </div>
                  </div>

                  <dl className="mt-6 space-y-3">
                    <StatusRow
                      label="Pool status"
                      value={pool?.statusLabel ?? (isLoading ? "Loading..." : "Unavailable")}
                    />
                    <StatusRow
                      label="Buying"
                      value={formatTradeState(pool?.canBuy, "Available", "Unavailable", isLoading)}
                    />
                    <StatusRow
                      label="Selling"
                      value={formatTradeState(pool?.canSell, "Available", "Unavailable", isLoading)}
                    />
                    <StatusRow
                      label="Buys paused"
                      value={formatTradeState(pool?.buysPaused, "Yes", "No", isLoading)}
                    />
                    <StatusRow
                      label="All trading paused"
                      value={formatTradeState(pool?.allTradingPaused, "Yes", "No", isLoading)}
                    />
                    <StatusRow
                      label="Factory launch creation paused"
                      value={formatTradeState(deployment?.paused, "Yes", "No", isLoading)}
                    />
                  </dl>
                </SectionCard>

                <SectionCard>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="eyebrow">Contract details</p>
                      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">
                        Secondary deployment and explorer information
                      </h2>
                    </div>
                  </div>

                  <details className="surface-muted mt-6 rounded-[var(--radius-md)] p-4 sm:p-5">
                    <summary className="cursor-pointer text-sm font-semibold text-white">
                      View contract details
                    </summary>
                    <dl className="mt-4 space-y-3">
                      <StatusRow
                        label="Launch count"
                        value={
                          deployment?.launchCount ?? (isLoading ? "Loading..." : "Unavailable")
                        }
                      />
                      <StatusRow
                        label="Factory"
                        value={formatCompactAddress(arcDeployment.factoryAddress)}
                      />
                      <StatusRow
                        label="Pool"
                        value={
                          poolAddress
                            ? formatCompactAddress(poolAddress)
                            : isLoading
                              ? "Loading..."
                              : "Unavailable"
                        }
                      />
                      <StatusRow
                        label="FeeVault treasury"
                        value={
                          deployment?.treasury
                            ? formatCompactAddress(deployment.treasury)
                            : isLoading
                              ? "Loading..."
                              : "Unavailable"
                        }
                      />
                      <StatusRow
                        label="Quote asset"
                        value={formatCompactAddress(arcDeployment.usdcAddress)}
                      />
                      <StatusRow
                        label="Pool quote asset"
                        value={
                          pool?.quoteAsset
                            ? formatCompactAddress(pool.quoteAsset)
                            : isLoading
                              ? "Loading..."
                              : "Unavailable"
                        }
                      />
                      <StatusRow
                        label="Arc Testnet staging adapter - not a DEX"
                        value={formatCompactAddress(arcDeployment.stagingAdapterAddress)}
                      />
                    </dl>
                    <div className="mt-5 flex flex-wrap gap-4">
                      <ExplorerLink
                        href={explorerLinks.factoryExplorerUrl}
                        label="Factory explorer"
                      />
                      {explorerLinks.poolExplorerUrl ? (
                        <ExplorerLink href={explorerLinks.poolExplorerUrl} label="Pool explorer" />
                      ) : null}
                      {explorerLinks.tokenExplorerUrl ? (
                        <ExplorerLink
                          href={explorerLinks.tokenExplorerUrl}
                          label="Token explorer"
                        />
                      ) : null}
                      <ExplorerLink
                        href={explorerLinks.stagingAdapterExplorerUrl}
                        label="Adapter explorer"
                      />
                    </div>
                  </details>
                </SectionCard>
              </div>
            </div>
          </>
        )}
      </Container>
    </main>
  );
}
