"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  buildArcLaunchesApiPath,
  isArcLaunchesApiError,
  isArcLaunchesApiSuccess,
  type ArcLaunchListItem,
  type ArcLaunchSort,
  type ArcLaunchStatusFilter,
  type ArcLaunchesApiError,
  type ArcLaunchesApiSuccess
} from "../../lib/arc/launches-api";
import { formatCompactAddress, formatPercentage, formatUsdcAmount } from "../../lib/arc/format";
import { Container } from "../layout/Container";
import { Button } from "../ui/Button";

type LaunchBrowserState =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: ArcLaunchesApiSuccess; error: null }
  | { status: "empty"; data: ArcLaunchesApiSuccess; error: null }
  | { status: "rpc-unavailable" | "invalid-request"; data: null; error: ArcLaunchesApiError };

type LaunchBrowserProps = {
  onLaunchCountChange?: (launchCount: number) => void;
};

const DEFAULT_PAGE_SIZE = 12;

function formatReserve(value: string | undefined) {
  return value ? `${formatUsdcAmount(BigInt(value))} USDC` : "Unavailable";
}

function formatRemainingCapacity(value: string | undefined) {
  return value ? `${formatUsdcAmount(BigInt(value))} USDC remaining` : "Capacity unavailable";
}

function clampProgress(value: number | undefined) {
  return Math.max(0, Math.min(100, value ?? 0));
}

function getLaunchStateTone(item: ArcLaunchListItem) {
  if (item.hasCanonicalError) {
    return "border-rose-300/18 bg-rose-300/10 text-rose-100";
  }

  if (item.poolStatus === 2) {
    return "border-amber-300/18 bg-amber-300/10 text-amber-100";
  }

  if (item.poolStatus === 3) {
    return "border-white/12 bg-white/8 text-slate-200";
  }

  if (item.canBuy === false || item.canSell === false) {
    return "border-amber-300/18 bg-amber-300/10 text-amber-100";
  }

  return "border-emerald-300/18 bg-emerald-300/10 text-emerald-100";
}

function LoadingCard() {
  return (
    <div className="surface-card h-full animate-pulse rounded-[var(--radius-lg)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="h-4 w-20 rounded-full bg-white/10" />
          <div className="h-8 w-44 rounded-full bg-white/10" />
          <div className="h-4 w-32 rounded-full bg-white/10" />
        </div>
        <div className="h-8 w-24 rounded-full bg-white/10" />
      </div>
      <div className="mt-6 space-y-4">
        <div className="h-16 rounded-[var(--radius-md)] bg-white/6" />
        <div className="h-3 rounded-full bg-white/8" />
        <div className="h-14 rounded-[var(--radius-md)] bg-white/6" />
      </div>
      <div className="mt-6 flex gap-3">
        <div className="h-11 flex-1 rounded-full bg-white/10" />
        <div className="h-11 w-24 rounded-full bg-white/10" />
      </div>
    </div>
  );
}

function LaunchCard({ item }: { item: ArcLaunchListItem }) {
  const progress = clampProgress(item.graduationProgress);

  return (
    <article className="surface-card flex h-full flex-col rounded-[var(--radius-lg)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="eyebrow text-[var(--text-faint)]">Launch #{item.launchId}</span>
            <span className="surface-muted inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-secondary)]">
              ${item.symbol ?? "UNKNOWN"}
            </span>
          </div>
          <h3 className="mt-4 break-words text-2xl font-semibold tracking-tight text-white">
            {item.name ?? "Unavailable launch"}
          </h3>
          <p className="mt-2 truncate text-sm text-[var(--text-muted)]" title={item.tokenAddress}>
            Token {formatCompactAddress(item.tokenAddress)}
          </p>
        </div>
        <span
          className={[
            "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.24em]",
            getLaunchStateTone(item)
          ].join(" ")}
        >
          {item.poolStatusLabel ?? "Launch warning"}
        </span>
      </div>

      <div className="mt-6 space-y-4">
        <div className="surface-muted rounded-[var(--radius-md)] p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-muted)]">Real USDC reserve</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {formatReserve(item.realUsdcReserve)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-[var(--text-muted)]">Graduation</p>
              <p className="mt-2 text-lg font-semibold tabular-nums text-white">
                {formatPercentage(progress)}
              </p>
            </div>
          </div>

          <div
            aria-label={`Graduation progress ${formatPercentage(progress)}`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress}
            className="mt-4 progress-track"
            role="progressbar"
          >
            <span className="progress-fill" style={{ width: `${progress}%` }} />
          </div>

          <p className="mt-3 text-xs leading-6 text-[var(--text-faint)]">
            {formatRemainingCapacity(item.remainingGraduationCapacity)}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <dl className="surface-muted rounded-[var(--radius-md)] p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-faint)]">
              Buy availability
            </dt>
            <dd className="mt-2 text-sm font-medium text-white">
              {item.canBuy === undefined ? "Unavailable" : item.canBuy ? "Available" : "Paused"}
            </dd>
          </dl>
          <dl className="surface-muted rounded-[var(--radius-md)] p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-faint)]">
              Sell availability
            </dt>
            <dd className="mt-2 text-sm font-medium text-white">
              {item.canSell === undefined ? "Unavailable" : item.canSell ? "Available" : "Paused"}
            </dd>
          </dl>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="surface-muted min-w-0 rounded-[var(--radius-md)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-faint)]">
              Creator
            </p>
            <p className="mt-2 truncate font-mono text-sm text-white" title={item.creator}>
              {formatCompactAddress(item.creator)}
            </p>
          </div>
          <div className="surface-muted min-w-0 rounded-[var(--radius-md)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-faint)]">
              Token address
            </p>
            <p className="mt-2 truncate font-mono text-sm text-white" title={item.tokenAddress}>
              {formatCompactAddress(item.tokenAddress)}
            </p>
          </div>
        </div>

        {item.warnings.length > 0 ? (
          <details className="rounded-[var(--radius-md)] border border-amber-300/14 bg-amber-300/8 px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-amber-100">
              <span>
                {item.hasCanonicalError
                  ? "Launch warning"
                  : `${item.warnings.length} read warning${item.warnings.length > 1 ? "s" : ""}`}
              </span>
              <span className="text-xs uppercase tracking-[0.22em] text-amber-100/70">Details</span>
            </summary>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
              {item.warnings.map((warning) => (
                <li key={`${warning.label}-${warning.message}`}>
                  <span className="font-medium text-white">{warning.label}:</span> {warning.message}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <Button className="w-full justify-center" href={item.tokenPageUrl}>
          Open token page
        </Button>
        <div className="flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
          <Link
            className="rounded-full transition hover:text-white"
            href={item.tokenExplorerUrl}
            rel="noreferrer"
            target="_blank"
          >
            Token explorer
          </Link>
          <Link
            className="rounded-full transition hover:text-white"
            href={item.poolExplorerUrl}
            rel="noreferrer"
            target="_blank"
          >
            Pool explorer
          </Link>
          <Link
            className="rounded-full transition hover:text-white"
            href={item.creatorExplorerUrl}
            rel="noreferrer"
            target="_blank"
          >
            Creator explorer
          </Link>
        </div>
      </div>
    </article>
  );
}

function ErrorState({ error, onRetry }: { error: ArcLaunchesApiError; onRetry: () => void }) {
  return (
    <div className="surface-panel space-y-5 rounded-[var(--radius-lg)] border-rose-300/18 bg-rose-300/8 px-5 py-5 sm:px-6">
      <div>
        <p className="eyebrow text-rose-100/75">
          {error.code === "INVALID_REQUEST" ? "Invalid request" : "RPC unavailable"}
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          Unable to load live launches right now.
        </h3>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
          {error.message}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button onClick={onRetry} type="button">
          Retry reads
        </Button>
        <Button href="/launch" variant="secondary">
          Open launch page
        </Button>
      </div>
      <details className="surface-muted rounded-[var(--radius-md)] p-4">
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

export function LaunchBrowser({ onLaunchCountChange }: LaunchBrowserProps) {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState({
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    sort: "newest" as ArcLaunchSort,
    status: "all" as ArcLaunchStatusFilter,
    search: ""
  });
  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<LaunchBrowserState>({
    status: "loading",
    data: null,
    error: null
  });

  const apiPath = useMemo(
    () =>
      buildArcLaunchesApiPath({
        page: query.page,
        limit: query.limit,
        sort: query.sort,
        status: query.status,
        search: query.search
      }),
    [query]
  );

  useEffect(() => {
    const abortController = new AbortController();

    setState({
      status: "loading",
      data: null,
      error: null
    });

    async function loadLaunches() {
      try {
        const response = await fetch(apiPath, {
          cache: "no-store",
          headers: {
            accept: "application/json"
          },
          signal: abortController.signal
        });
        const payload = (await response.json()) as unknown;

        if (!response.ok) {
          const error = isArcLaunchesApiError(payload)
            ? payload
            : ({
                ok: false,
                code: "RPC_UNAVAILABLE",
                details: [
                  {
                    label: "Launches route",
                    message: `The route returned HTTP ${response.status}.`
                  }
                ],
                message: `The route returned HTTP ${response.status}.`
              } satisfies ArcLaunchesApiError);

          if (abortController.signal.aborted) {
            return;
          }

          setState({
            status: error.code === "INVALID_REQUEST" ? "invalid-request" : "rpc-unavailable",
            data: null,
            error
          });
          return;
        }

        if (!isArcLaunchesApiSuccess(payload)) {
          throw new Error("The launches route returned an unexpected response shape.");
        }

        if (abortController.signal.aborted) {
          return;
        }

        setState({
          status: payload.items.length === 0 ? "empty" : "success",
          data: payload,
          error: null
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setState({
          status: "rpc-unavailable",
          data: null,
          error: {
            ok: false,
            code: "RPC_UNAVAILABLE",
            details: [
              {
                label: "Launches route",
                message: error instanceof Error ? error.message : "Launch list request failed."
              }
            ],
            message: "Unable to load LibrARC launches from Arc Testnet."
          }
        });
      }
    }

    void loadLaunches();

    return () => {
      abortController.abort();
    };
  }, [apiPath, retryNonce]);

  useEffect(() => {
    if (state.data) {
      onLaunchCountChange?.(state.data.totalLaunchCount);
    }
  }, [onLaunchCountChange, state.data]);

  const totalLaunchCount = state.data?.totalLaunchCount ?? 0;
  const helperCopy =
    query.search || query.status !== "all"
      ? "Filtered searches stay bounded server-side so Discover remains fast as the Factory grows."
      : "Every launch card is resolved from the active Arc Testnet LaunchFactory.";

  return (
    <section
      aria-labelledby="discover-title"
      className="pb-20 pt-12 sm:pb-24 sm:pt-16"
      id="discover"
    >
      <Container>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="eyebrow">Live launches</p>
            <h2
              className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[2.8rem]"
              id="discover-title"
            >
              Explore real Factory launches with better signal and less noise.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
              {helperCopy}
            </p>
          </div>

          <div className="surface-card w-full max-w-sm rounded-[var(--radius-lg)] px-5 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-faint)]">
              Discover count
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-white tabular-nums">
              {state.status === "loading" ? "..." : totalLaunchCount.toLocaleString("en-US")}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              Live launches currently visible from the verified Arc registry.
            </p>
          </div>
        </div>

        <div className="surface-panel mt-10 rounded-[var(--radius-xl)] p-5 sm:p-6">
          <form
            className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_11rem_11rem_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery((current) => ({
                ...current,
                page: 1,
                search: searchInput.trim()
              }));
            }}
          >
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-white">Search launches</span>
              <input
                className="field-shell text-sm placeholder:text-[var(--text-faint)]"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Name, symbol, token, creator, or pool address"
                type="search"
                value={searchInput}
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-white">Sort</span>
              <select
                className="field-shell appearance-none text-sm"
                onChange={(event) =>
                  setQuery((current) => ({
                    ...current,
                    page: 1,
                    sort: event.target.value as ArcLaunchSort
                  }))
                }
                value={query.sort}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-white">Status</span>
              <select
                className="field-shell appearance-none text-sm"
                onChange={(event) =>
                  setQuery((current) => ({
                    ...current,
                    page: 1,
                    status: event.target.value as ArcLaunchStatusFilter
                  }))
                }
                value={query.status}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="graduation-pending">Graduation pending</option>
                <option value="graduated">Graduated</option>
                <option value="paused">Paused</option>
              </select>
            </label>

            <div className="flex flex-wrap items-end gap-3">
              <Button className="flex-1 sm:flex-none" type="submit">
                Search
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => {
                  setSearchInput("");
                  setQuery({
                    page: 1,
                    limit: DEFAULT_PAGE_SIZE,
                    sort: "newest",
                    status: "all",
                    search: ""
                  });
                  setRetryNonce((value) => value + 1);
                }}
                type="button"
                variant="secondary"
              >
                Reset
              </Button>
            </div>
          </form>

          {state.status === "loading" ? (
            <div className="mt-8 grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <LoadingCard key={index} />
              ))}
            </div>
          ) : null}

          {state.status === "rpc-unavailable" || state.status === "invalid-request" ? (
            <div className="mt-8">
              <ErrorState
                error={state.error}
                onRetry={() => {
                  setRetryNonce((value) => value + 1);
                }}
              />
            </div>
          ) : null}

          {state.status === "empty" && state.data ? (
            <div className="surface-card mt-8 space-y-4 rounded-[var(--radius-lg)] px-6 py-6">
              <h3 className="text-2xl font-semibold tracking-tight text-white">
                {state.data.totalLaunchCount === 0
                  ? "No launches are registered yet."
                  : "No launches matched this filter."}
              </h3>
              <p className="text-sm leading-6 text-[var(--text-muted)]">
                {state.data.totalLaunchCount === 0
                  ? "New Factory launches will appear here automatically as soon as they are created on Arc Testnet."
                  : "Adjust the search term, sort order, or status filter and try again."}
              </p>
              <div className="pt-2">
                <Button href="/launch">Open launch page</Button>
              </div>
            </div>
          ) : null}

          {state.data?.warnings.length ? (
            <details className="mt-6 rounded-[var(--radius-md)] border border-amber-300/14 bg-amber-300/8 px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-amber-100">
                Partial read warning
              </summary>
              <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                {state.data.warnings[0]?.message}
              </p>
            </details>
          ) : null}

          {state.status === "success" && state.data ? (
            <>
              <div className="mt-8 grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                {state.data.items.map((item) => (
                  <LaunchCard item={item} key={`${item.launchId}-${item.tokenAddress}`} />
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-4 border-t border-white/8 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">
                    Page {state.data.currentPage} of {Math.max(state.data.totalPages, 1)}
                  </p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {state.data.totalFilteredLaunches.toLocaleString("en-US")} matching launches
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={!state.data.hasPreviousPage}
                    onClick={() =>
                      setQuery((current) => ({
                        ...current,
                        page: Math.max(1, current.page - 1)
                      }))
                    }
                    type="button"
                    variant="secondary"
                  >
                    Previous
                  </Button>
                  <Button
                    disabled={!state.data.hasNextPage}
                    onClick={() =>
                      setQuery((current) => ({
                        ...current,
                        page: current.page + 1
                      }))
                    }
                    type="button"
                    variant="secondary"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
