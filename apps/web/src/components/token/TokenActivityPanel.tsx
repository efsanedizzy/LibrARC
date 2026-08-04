"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useId, useState } from "react";
import { type Address } from "viem";

import {
  formatCompactAddress,
  formatCompactLaunchTokenAmount,
  formatCompactUsdcAmount,
  formatUsdcAmount
} from "../../lib/arc/format";
import {
  buildArcTokenActivityApiPath,
  buildArcTokenHoldersApiPath,
  isArcTokenActivityApiError,
  isArcTokenHoldersActivitySuccess,
  isArcTokenTradesActivitySuccess,
  type ArcTokenActivityApiError,
  type ArcTokenHolderActivityItem,
  type ArcTokenHoldersActivitySuccess,
  type ArcTokenTradeActivityItem,
  type ArcTokenTradesActivitySuccess
} from "../../lib/arc/token-activity-api";
import { Button } from "../ui/Button";
import { SurfaceCard } from "../ui/SurfaceCard";

type TokenActivityPanelProps = {
  poolExplorerUrl?: string;
  tokenAddress: Address;
  tokenExplorerUrl?: string;
  tokenSymbol?: string;
};

type ActivityTab = "holders" | "trades";

type LoadState<T> =
  | { status: "idle" | "loading" }
  | { status: "error"; error: ArcTokenActivityApiError }
  | { status: "ready"; data: T };

const PAGE_LIMIT = 25;
const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function buildActivityFallbackError(label: string, message: string): ArcTokenActivityApiError {
  return {
    ok: false,
    code: "RPC_UNAVAILABLE",
    message,
    details: [
      {
        label,
        message
      }
    ]
  };
}

function formatCompactHash(value: `0x${string}`) {
  return `${value.slice(0, 6)}...${value.slice(-5)}`;
}

function getRoleLabel(role: ArcTokenHolderActivityItem["role"]) {
  switch (role) {
    case "creator":
      return "Creator";
    case "pool":
      return "Pool";
    case "contract":
      return "Contract";
    default:
      return null;
  }
}

function formatActivityTimestamp(timestamp: string | undefined) {
  if (!timestamp) {
    return {
      label: "Unavailable",
      title: "Timestamp unavailable"
    };
  }

  const unixSeconds = Number(timestamp);

  if (!Number.isFinite(unixSeconds)) {
    return {
      label: "Unavailable",
      title: "Timestamp unavailable"
    };
  }

  const date = new Date(unixSeconds * 1000);
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(deltaSeconds);

  let value = deltaSeconds;
  let unit: Intl.RelativeTimeFormatUnit = "second";

  if (absoluteSeconds >= 60 && absoluteSeconds < 3600) {
    value = Math.round(deltaSeconds / 60);
    unit = "minute";
  } else if (absoluteSeconds >= 3600 && absoluteSeconds < 86_400) {
    value = Math.round(deltaSeconds / 3600);
    unit = "hour";
  } else if (absoluteSeconds >= 86_400) {
    value = Math.round(deltaSeconds / 86_400);
    unit = "day";
  }

  return {
    label: relativeTimeFormatter.format(value, unit),
    title: date.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short"
    })
  };
}

function ActivityStatus({
  children,
  tone
}: {
  children: ReactNode;
  tone: "buy" | "neutral" | "sell";
}) {
  const className =
    tone === "buy"
      ? "border-[rgba(109,196,143,0.2)] bg-[rgba(109,196,143,0.1)] text-[color:var(--success)]"
      : tone === "sell"
        ? "border-[rgba(213,109,120,0.22)] bg-[rgba(213,109,120,0.1)] text-[color:var(--danger)]"
        : "border-[var(--border-soft)] bg-[rgba(255,255,255,0.02)] text-[var(--text-secondary)]";

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em]",
        className
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function WarningList({ warnings }: { warnings: Array<{ label: string; message: string }> }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-[rgba(214,163,76,0.42)] bg-[rgba(214,163,76,0.08)] px-4 py-3">
      <ul className="space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
        {warnings.map((warning) => (
          <li key={`${warning.label}-${warning.message}`}>
            <span className="font-semibold text-white">{warning.label}:</span> {warning.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: ArcTokenActivityApiError; onRetry: () => void }) {
  return (
    <div className="space-y-4 rounded-[var(--radius-md)] border border-[rgba(213,109,120,0.42)] bg-[rgba(213,109,120,0.08)] px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-white">
          {error.code === "RPC_UNAVAILABLE" || error.code === "CONTRACT_READ_FAILED"
            ? "Unable to load live Arc Testnet activity right now."
            : error.message}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          Retry the read to request fresh on-chain activity from the canonical pool.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onRetry} size="sm" variant="secondary">
          Retry reads
        </Button>
      </div>
      <details className="surface-muted rounded-[var(--radius-md)] px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-white">
          Technical details
        </summary>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
          {error.details.map((detail) => (
            <li key={`${detail.label}-${detail.message}`}>
              <span className="font-semibold text-white">{detail.label}:</span> {detail.message}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function LoadingRows() {
  return (
    <div aria-live="polite" className="space-y-3" role="status">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-9 w-40 animate-pulse rounded-full bg-white/[0.05]" />
        <div className="h-9 w-28 animate-pulse rounded-full bg-white/[0.05]" />
      </div>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-soft)]">
        {Array.from({ length: 7 }).map((_, index) => (
          <div
            className="grid animate-pulse grid-cols-[1.1fr_1.2fr] gap-3 border-b border-[var(--border-soft)] px-4 py-4 last:border-b-0 md:grid-cols-[0.9fr_1.2fr_1fr_0.9fr_0.9fr_0.9fr]"
            key={index}
          >
            <div className="h-4 rounded bg-white/[0.05]" />
            <div className="h-4 rounded bg-white/[0.05]" />
            <div className="hidden h-4 rounded bg-white/[0.05] md:block" />
            <div className="hidden h-4 rounded bg-white/[0.05] md:block" />
            <div className="hidden h-4 rounded bg-white/[0.05] md:block" />
            <div className="hidden h-4 rounded bg-white/[0.05] md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Pagination({
  hasNextPage,
  hasPreviousPage,
  onNext,
  onPrevious,
  page
}: {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNext: () => void;
  onPrevious: () => void;
  page: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-4">
      <p className="text-sm text-[var(--text-muted)]">Page {page}</p>
      <div className="flex items-center gap-2">
        <Button disabled={!hasPreviousPage} onClick={onPrevious} size="sm" variant="secondary">
          Previous
        </Button>
        <Button disabled={!hasNextPage} onClick={onNext} size="sm" variant="secondary">
          Next
        </Button>
      </div>
    </div>
  );
}

function TradesTable({
  tokenSymbol,
  trades
}: {
  tokenSymbol: string;
  trades: ArcTokenTradeActivityItem[];
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-soft)] md:block">
        <div className="grid grid-cols-[0.85fr_1.3fr_1fr_1fr_0.9fr_0.95fr] gap-4 border-b border-[var(--border-soft)] px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
          <span>Type</span>
          <span>Amount</span>
          <span>Trader</span>
          <span>USDC</span>
          <span>Time</span>
          <span>Transaction</span>
        </div>

        {trades.map((trade) => {
          const timestamp = formatActivityTimestamp(trade.timestamp);
          const directionTone = trade.kind === "buy" ? "buy" : "sell";
          const directionIcon = trade.kind === "buy" ? "↗" : "↘";
          const usdcCaption =
            trade.kind === "buy"
              ? `Net reserve ${formatCompactUsdcAmount(BigInt(trade.netUsdcAmount))} USDC`
              : `Net to seller ${formatCompactUsdcAmount(BigInt(trade.netUsdcAmount))} USDC`;

          return (
            <div
              className="grid grid-cols-[0.85fr_1.3fr_1fr_1fr_0.9fr_0.95fr] gap-4 border-b border-[var(--border-soft)] px-4 py-4 text-sm last:border-b-0"
              key={`${trade.transactionHash}-${trade.logIndex}`}
            >
              <div className="min-w-0">
                <ActivityStatus tone={directionTone}>
                  {directionIcon} {trade.kind}
                </ActivityStatus>
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white tabular-nums">
                  {formatCompactLaunchTokenAmount(BigInt(trade.tokenAmount))} {tokenSymbol}
                </p>
                <p
                  className="mt-1 text-xs text-[var(--text-muted)]"
                  title={`Fee ${formatUsdcAmount(BigInt(trade.fee))} USDC`}
                >
                  Fee {formatCompactUsdcAmount(BigInt(trade.fee))} USDC
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-white" title={trade.trader}>
                  {formatCompactAddress(trade.trader)}
                </p>
                {trade.recipient && trade.recipient !== trade.trader ? (
                  <p
                    className="mt-1 truncate text-xs text-[var(--text-muted)]"
                    title={trade.recipient}
                  >
                    to {formatCompactAddress(trade.recipient)}
                  </p>
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white tabular-nums">
                  {formatCompactUsdcAmount(BigInt(trade.grossUsdcAmount))} USDC
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{usdcCaption}</p>
              </div>
              <div className="min-w-0">
                <span className="text-sm text-white" title={timestamp.title}>
                  {timestamp.label}
                </span>
              </div>
              <div className="min-w-0">
                <Link
                  className="inline-flex text-sm font-semibold text-[var(--accent-strong)] transition hover:text-white"
                  href={trade.transactionExplorerUrl}
                  rel="noreferrer"
                  target="_blank"
                  title={trade.transactionHash}
                >
                  {formatCompactHash(trade.transactionHash)}
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3 md:hidden">
        {trades.map((trade) => {
          const timestamp = formatActivityTimestamp(trade.timestamp);
          const directionTone = trade.kind === "buy" ? "buy" : "sell";
          const directionIcon = trade.kind === "buy" ? "↗" : "↘";

          return (
            <div
              className="rounded-[var(--radius-md)] border border-[var(--border-soft)] px-4 py-4"
              key={`${trade.transactionHash}-${trade.logIndex}`}
            >
              <div className="flex items-start justify-between gap-3">
                <ActivityStatus tone={directionTone}>
                  {directionIcon} {trade.kind}
                </ActivityStatus>
                <Link
                  className="text-sm font-semibold text-[var(--accent-strong)] transition hover:text-white"
                  href={trade.transactionExplorerUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Tx ↗
                </Link>
              </div>
              <p className="mt-3 font-semibold text-white tabular-nums">
                {formatCompactLaunchTokenAmount(BigInt(trade.tokenAmount))} {tokenSymbol}
              </p>
              <p
                className="mt-1 font-mono text-sm text-[var(--text-secondary)]"
                title={trade.trader}
              >
                {formatCompactAddress(trade.trader)}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="font-medium text-white tabular-nums">
                  {formatCompactUsdcAmount(BigInt(trade.grossUsdcAmount))} USDC
                </span>
                <span className="text-[var(--text-muted)]" title={timestamp.title}>
                  {timestamp.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function HoldersTable({
  complete,
  holders,
  tokenSymbol
}: {
  complete: boolean;
  holders: ArcTokenHolderActivityItem[];
  tokenSymbol: string;
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-soft)] md:block">
        <div className="grid grid-cols-[0.55fr_1.2fr_1.2fr_0.8fr_0.8fr_0.7fr] gap-4 border-b border-[var(--border-soft)] px-4 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
          <span>Rank</span>
          <span>Holder</span>
          <span>Balance</span>
          <span>Share</span>
          <span>Role</span>
          <span>Explorer</span>
        </div>

        {holders.map((holder) => {
          const roleLabel = getRoleLabel(holder.role);

          return (
            <div
              className="grid grid-cols-[0.55fr_1.2fr_1.2fr_0.8fr_0.8fr_0.7fr] gap-4 border-b border-[var(--border-soft)] px-4 py-4 text-sm last:border-b-0"
              key={`${holder.rank}-${holder.address}`}
            >
              <span className="font-semibold text-white">{holder.rank}</span>
              <p className="truncate font-mono text-white" title={holder.address}>
                {formatCompactAddress(holder.address)}
              </p>
              <span className="font-semibold text-white tabular-nums">
                {formatCompactLaunchTokenAmount(BigInt(holder.balance))} {tokenSymbol}
              </span>
              <span className="text-[var(--text-secondary)]">
                {complete ? (holder.sharePercent ?? "—") : "—"}
              </span>
              <div>
                {roleLabel ? <ActivityStatus tone="neutral">{roleLabel}</ActivityStatus> : "—"}
              </div>
              <Link
                className="inline-flex text-sm font-semibold text-[var(--accent-strong)] transition hover:text-white"
                href={holder.explorerUrl}
                rel="noreferrer"
                target="_blank"
              >
                View ↗
              </Link>
            </div>
          );
        })}
      </div>

      <div className="space-y-3 md:hidden">
        {holders.map((holder) => {
          const roleLabel = getRoleLabel(holder.role);

          return (
            <div
              className="rounded-[var(--radius-md)] border border-[var(--border-soft)] px-4 py-4"
              key={`${holder.rank}-${holder.address}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-white">#{holder.rank}</span>
                <Link
                  className="text-sm font-semibold text-[var(--accent-strong)] transition hover:text-white"
                  href={holder.explorerUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Explorer ↗
                </Link>
              </div>
              <p className="mt-3 font-mono text-sm text-white" title={holder.address}>
                {formatCompactAddress(holder.address)}
              </p>
              <p className="mt-3 font-semibold text-white tabular-nums">
                {formatCompactLaunchTokenAmount(BigInt(holder.balance))} {tokenSymbol}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span>{complete ? (holder.sharePercent ?? "—") : "—"}</span>
                {roleLabel ? <ActivityStatus tone="neutral">{roleLabel}</ActivityStatus> : null}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function TokenActivityPanel({
  poolExplorerUrl,
  tokenAddress,
  tokenExplorerUrl,
  tokenSymbol = "LARC"
}: TokenActivityPanelProps) {
  const tradesTabId = useId();
  const holdersTabId = useId();
  const tradesPanelId = useId();
  const holdersPanelId = useId();
  const [activeTab, setActiveTab] = useState<ActivityTab>("trades");
  const [tradesPage, setTradesPage] = useState(1);
  const [holdersPage, setHoldersPage] = useState(1);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [tradesState, setTradesState] = useState<LoadState<ArcTokenTradesActivitySuccess>>({
    status: "idle"
  });
  const [holdersState, setHoldersState] = useState<LoadState<ArcTokenHoldersActivitySuccess>>({
    status: "idle"
  });

  useEffect(() => {
    setActiveTab("trades");
    setTradesPage(1);
    setHoldersPage(1);
    setTradesState({ status: "idle" });
    setHoldersState({ status: "idle" });
  }, [tokenAddress]);

  useEffect(() => {
    const abortController = new AbortController();
    const isTradesTab = activeTab === "trades";
    const page = isTradesTab ? tradesPage : holdersPage;
    const path = isTradesTab
      ? buildArcTokenActivityApiPath(tokenAddress, { limit: PAGE_LIMIT, page })
      : buildArcTokenHoldersApiPath(tokenAddress, { limit: PAGE_LIMIT, page });

    if (isTradesTab) {
      setTradesState({ status: "loading" });
    } else {
      setHoldersState({ status: "loading" });
    }

    async function load() {
      try {
        const response = await fetch(path, {
          cache: "no-store",
          headers: {
            accept: "application/json"
          },
          signal: abortController.signal
        });
        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          throw isArcTokenActivityApiError(payload)
            ? payload
            : buildActivityFallbackError(
                isTradesTab ? "Trades route" : "Holders route",
                `The route returned HTTP ${response.status}.`
              );
        }

        if (isTradesTab) {
          if (!isArcTokenTradesActivitySuccess(payload)) {
            throw buildActivityFallbackError(
              "Trades route",
              "The recent-trades route returned an unexpected response shape."
            );
          }

          if (!abortController.signal.aborted) {
            setTradesState({
              status: "ready",
              data: payload
            });
          }

          return;
        }

        if (!isArcTokenHoldersActivitySuccess(payload)) {
          throw buildActivityFallbackError(
            "Holders route",
            "The holders route returned an unexpected response shape."
          );
        }

        if (!abortController.signal.aborted) {
          setHoldersState({
            status: "ready",
            data: payload
          });
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        const normalizedError = isArcTokenActivityApiError(error)
          ? error
          : buildActivityFallbackError(
              isTradesTab ? "Trades route" : "Holders route",
              error instanceof Error ? error.message : "The request failed."
            );

        if (isTradesTab) {
          setTradesState({
            status: "error",
            error: normalizedError
          });
        } else {
          setHoldersState({
            status: "error",
            error: normalizedError
          });
        }
      }
    }

    void load();

    return () => {
      abortController.abort();
    };
  }, [activeTab, holdersPage, reloadNonce, tokenAddress, tradesPage]);

  const activeState = activeTab === "trades" ? tradesState : holdersState;
  const activePage = activeTab === "trades" ? tradesPage : holdersPage;
  const readyTrades =
    activeTab === "trades" && tradesState.status === "ready" ? tradesState.data : null;
  const readyHolders =
    activeTab === "holders" && holdersState.status === "ready" ? holdersState.data : null;
  const activeCountBadge =
    activeTab === "holders" &&
    holdersState.status === "ready" &&
    holdersState.data.complete &&
    holdersState.data.holderCount !== undefined
      ? `${holdersState.data.holderCount} holders`
      : null;

  return (
    <SurfaceCard
      className="space-y-5 border-[rgba(82,95,117,0.48)] bg-[linear-gradient(180deg,rgba(76,128,255,0.03),rgba(20,25,34,0.98)_18%,rgba(18,23,31,0.99))]"
      padding="md"
      tone="card"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="eyebrow">Activity</p>
            {activeCountBadge ? (
              <span className="rounded-full border border-[var(--border-soft)] bg-[rgba(255,255,255,0.02)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                {activeCountBadge}
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-[1.45rem]">
            Real on-chain pool activity
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {poolExplorerUrl ? (
            <Link
              className="inline-flex min-h-9 items-center rounded-[0.85rem] border border-[var(--border-soft)] px-3.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-strong)] hover:text-white"
              href={poolExplorerUrl}
              rel="noreferrer"
              target="_blank"
            >
              Pool contract ↗
            </Link>
          ) : null}
          {tokenExplorerUrl ? (
            <Link
              className="inline-flex min-h-9 items-center rounded-[0.85rem] border border-[var(--border-soft)] px-3.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-strong)] hover:text-white"
              href={tokenExplorerUrl}
              rel="noreferrer"
              target="_blank"
            >
              Token explorer ↗
            </Link>
          ) : null}
          <Button
            onClick={() => setReloadNonce((value) => value + 1)}
            size="sm"
            variant="secondary"
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          aria-label="Activity view"
          className="surface-muted inline-flex rounded-[var(--radius-md)] p-1"
          role="tablist"
        >
          <button
            aria-controls={tradesPanelId}
            aria-selected={activeTab === "trades"}
            className={[
              "min-h-9 rounded-[calc(var(--radius-md)-0.2rem)] px-4 py-2 text-sm font-semibold transition",
              activeTab === "trades"
                ? "bg-[var(--bg-surface-strong)] text-white shadow-[inset_0_0_0_1px_rgba(76,128,255,0.18)]"
                : "text-[var(--text-muted)] hover:text-white"
            ].join(" ")}
            id={tradesTabId}
            onClick={() => setActiveTab("trades")}
            role="tab"
            tabIndex={activeTab === "trades" ? 0 : -1}
            type="button"
          >
            Recent trades
          </button>
          <button
            aria-controls={holdersPanelId}
            aria-selected={activeTab === "holders"}
            className={[
              "min-h-9 rounded-[calc(var(--radius-md)-0.2rem)] px-4 py-2 text-sm font-semibold transition",
              activeTab === "holders"
                ? "bg-[var(--bg-surface-strong)] text-white shadow-[inset_0_0_0_1px_rgba(76,128,255,0.18)]"
                : "text-[var(--text-muted)] hover:text-white"
            ].join(" ")}
            id={holdersTabId}
            onClick={() => setActiveTab("holders")}
            role="tab"
            tabIndex={activeTab === "holders" ? 0 : -1}
            type="button"
          >
            Holders
          </button>
        </div>

        <p className="text-sm text-[var(--text-muted)]">
          {activeTab === "trades"
            ? "Exact BuyExecuted and SellExecuted logs from the canonical LaunchPool."
            : "Transfer-log derived balances from the canonical launch token."}
        </p>
      </div>

      <div
        aria-labelledby={activeTab === "trades" ? tradesTabId : holdersTabId}
        id={activeTab === "trades" ? tradesPanelId : holdersPanelId}
        role="tabpanel"
      >
        {activeState.status === "loading" || activeState.status === "idle" ? <LoadingRows /> : null}

        {activeState.status === "error" ? (
          <ErrorState
            error={activeState.error}
            onRetry={() => setReloadNonce((value) => value + 1)}
          />
        ) : null}

        {readyTrades ? (
          <div className="space-y-4">
            <WarningList warnings={readyTrades.warnings} />

            {readyTrades.trades.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-soft)] px-4 py-6 text-sm leading-6 text-[var(--text-secondary)]">
                <p className="text-white">
                  No confirmed trades have been recorded for this pool yet.
                </p>
                {poolExplorerUrl ? (
                  <Link
                    className="mt-3 inline-flex font-semibold text-[var(--accent-strong)] transition hover:text-white"
                    href={poolExplorerUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View canonical pool contract ↗
                  </Link>
                ) : null}
              </div>
            ) : (
              <>
                <TradesTable tokenSymbol={tokenSymbol} trades={readyTrades.trades} />
                <Pagination
                  hasNextPage={readyTrades.hasNextPage}
                  hasPreviousPage={readyTrades.hasPreviousPage}
                  onNext={() => setTradesPage((page) => page + 1)}
                  onPrevious={() => setTradesPage((page) => Math.max(1, page - 1))}
                  page={activePage}
                />
              </>
            )}
          </div>
        ) : null}

        {readyHolders ? (
          <div className="space-y-4">
            <WarningList warnings={readyHolders.warnings} />

            {!readyHolders.complete ? (
              <div className="rounded-[var(--radius-md)] border border-[rgba(214,163,76,0.42)] bg-[rgba(214,163,76,0.08)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
                Holder data is partially indexed. Verified balances are shown below.
              </div>
            ) : null}

            {readyHolders.holders.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border-soft)] px-4 py-6 text-sm leading-6 text-[var(--text-secondary)]">
                <p className="text-white">Holder distribution is not available yet.</p>
              </div>
            ) : (
              <>
                <HoldersTable
                  complete={readyHolders.complete}
                  holders={readyHolders.holders}
                  tokenSymbol={tokenSymbol}
                />
                <Pagination
                  hasNextPage={readyHolders.hasNextPage}
                  hasPreviousPage={readyHolders.hasPreviousPage}
                  onNext={() => setHoldersPage((page) => page + 1)}
                  onPrevious={() => setHoldersPage((page) => Math.max(1, page - 1))}
                  page={activePage}
                />
              </>
            )}
          </div>
        ) : null}
      </div>
    </SurfaceCard>
  );
}
