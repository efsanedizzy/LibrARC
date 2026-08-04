"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildArcLaunchesApiPath,
  isArcLaunchesApiError,
  isArcLaunchesApiSuccess,
  type ArcLaunchMetricKind,
  type ArcLaunchStatusFilter,
  type ArcLaunchTimeFilter,
  type ArcLaunchesApiError,
  type ArcLaunchesApiSuccess,
  type ArcLaunchSort
} from "../../lib/arc/launches-api";
import { Container } from "../layout/Container";
import { Button } from "../ui/Button";
import { SegmentedControl } from "../ui/SegmentedControl";
import { SurfaceCard } from "../ui/SurfaceCard";
import { DiscoverTokenCard } from "./DiscoverTokenCard";

type LaunchBrowserState =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: ArcLaunchesApiSuccess; error: null }
  | { status: "empty"; data: ArcLaunchesApiSuccess; error: null }
  | { status: "rpc-unavailable" | "invalid-request"; data: null; error: ArcLaunchesApiError };

type LaunchBrowserProps = {
  onLaunchCountChange?: (launchCount: number) => void;
};

const DEFAULT_PAGE_SIZE = 12;

function LoadingCard() {
  return (
    <SurfaceCard className="h-[20rem] animate-pulse border-white/6" padding="sm" tone="card">
      <div className="space-y-4">
        <div className="h-[5.25rem] w-[5.25rem] rounded-[1.15rem] bg-white/8" />
        <div className="space-y-2">
          <div className="h-4 w-28 rounded-full bg-white/8" />
          <div className="h-3 w-18 rounded-full bg-white/8" />
        </div>
        <div className="rounded-[1rem] bg-white/6 px-3.5 py-3">
          <div className="h-3 w-20 rounded-full bg-white/8" />
          <div className="mt-3 h-5 w-32 rounded-full bg-white/8" />
          <div className="mt-2 h-3 w-24 rounded-full bg-white/8" />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between gap-3">
            <div className="h-3 w-18 rounded-full bg-white/8" />
            <div className="h-3 w-12 rounded-full bg-white/8" />
          </div>
          <div className="h-1.5 rounded-full bg-white/8" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="h-3 w-20 rounded-full bg-white/8" />
          <div className="h-3 w-12 rounded-full bg-white/8" />
        </div>
        <div className="h-9 rounded-[0.9rem] bg-white/8" />
      </div>
    </SurfaceCard>
  );
}

function ErrorState({ error, onRetry }: { error: ArcLaunchesApiError; onRetry: () => void }) {
  return (
    <SurfaceCard
      className="border-[rgba(213,109,120,0.45)] bg-[rgba(213,109,120,0.08)]"
      tone="card"
    >
      <div className="space-y-4">
        <div>
          <p className="eyebrow">
            {error.code === "INVALID_REQUEST" ? "Invalid request" : "RPC unavailable"}
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
            Unable to load live launches right now.
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{error.message}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={onRetry}>Retry reads</Button>
          <Button href="/launch" variant="secondary">
            Create token
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
    </SurfaceCard>
  );
}

function SectionHeading({
  description,
  eyebrow,
  title
}: {
  description: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="space-y-2">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2 className="text-[1.35rem] font-semibold tracking-tight text-white sm:text-[1.5rem]">
        {title}
      </h2>
      <p className="max-w-2xl text-sm leading-6 text-[var(--text-muted)]">{description}</p>
    </div>
  );
}

function MetricBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
      <span className="text-[var(--text-faint)]">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function getMetricCountLabel(metricKind: ArcLaunchMetricKind, count: number) {
  if (metricKind === "marketCap") {
    return `${count} ranked by market cap`;
  }

  if (metricKind === "realUsdcReserve") {
    return `${count} ranked by real USDC reserves`;
  }

  if (metricKind === "volume") {
    return `${count} ranked by volume`;
  }

  if (metricKind === "recentBuys") {
    return `${count} ranked by recent buys`;
  }

  return `${count} ranked launches`;
}

export function LaunchBrowser({ onLaunchCountChange }: LaunchBrowserProps) {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState({
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    sort: "recentBuys" as ArcLaunchSort,
    status: "all" as ArcLaunchStatusFilter,
    search: "",
    timeFilter: "all" as ArcLaunchTimeFilter
  });
  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<LaunchBrowserState>({
    status: "loading",
    data: null,
    error: null
  });

  const shouldShowReset =
    searchInput.trim().length > 0 ||
    query.search.length > 0 ||
    query.status !== "all" ||
    query.sort !== "recentBuys" ||
    query.timeFilter !== "all";
  const usesEventRanking = query.sort === "recentBuys" || query.sort === "volume";

  const apiPath = useMemo(
    () =>
      buildArcLaunchesApiPath({
        page: query.page,
        limit: query.limit,
        sort: query.sort,
        status: query.status,
        search: query.search,
        timeFilter: query.timeFilter
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

  return (
    <section aria-labelledby="explore-title" className="pb-16 pt-1 sm:pb-20">
      <Container className="space-y-6 sm:space-y-7">
        <SurfaceCard className="border-white/6 bg-[rgba(26,32,43,0.92)]" padding="sm">
          <form
            className="flex flex-col gap-3 lg:flex-row lg:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery((current) => ({
                ...current,
                page: 1,
                search: searchInput.trim()
              }));
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search tokens</span>
              <input
                className="field-shell text-sm placeholder:text-[var(--text-faint)]"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search tokens, symbols, creators, pools, or addresses"
                type="search"
                value={searchInput}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">Search</Button>
              <Button href="/launch" variant="secondary">
                Create
              </Button>
              {shouldShowReset ? (
                <Button
                  onClick={() => {
                    setSearchInput("");
                    setQuery({
                      page: 1,
                      limit: DEFAULT_PAGE_SIZE,
                      sort: "recentBuys",
                      status: "all",
                      search: "",
                      timeFilter: "all"
                    });
                    setRetryNonce((value) => value + 1);
                  }}
                  type="button"
                  variant="ghost"
                >
                  Reset
                </Button>
              ) : null}
            </div>
          </form>
        </SurfaceCard>

        {state.status === "rpc-unavailable" || state.status === "invalid-request" ? (
          <ErrorState
            error={state.error}
            onRetry={() => {
              setRetryNonce((value) => value + 1);
            }}
          />
        ) : null}

        {state.status === "loading" ? (
          <>
            <section className="popular-frame rounded-[1.55rem] px-4 py-5 sm:px-5 sm:py-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <SectionHeading
                  description="Ranking live launches using the strongest genuine on-chain signal currently available."
                  eyebrow="Featured"
                  title="Popular"
                />
                <MetricBadge label="Loading" value="Fetching live ranks" />
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 5 }, (_, index) => (
                  <LoadingCard key={`popular-loading-${index}`} />
                ))}
              </div>
            </section>

            <SurfaceCard className="space-y-6" tone="panel">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <SectionHeading
                  description="Discover tokens still moving through the LibrARC launch curve."
                  title="Explore"
                />
                <div className="flex flex-col gap-3 xl:items-end">
                  <div className="h-11 w-full rounded-[var(--radius-md)] bg-white/8 xl:w-[34rem]" />
                  <div className="h-11 w-full rounded-[var(--radius-md)] bg-white/8 xl:w-[26rem]" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 10 }, (_, index) => (
                  <LoadingCard key={`explore-loading-${index}`} />
                ))}
              </div>
            </SurfaceCard>
          </>
        ) : null}

        {state.data ? (
          <>
            <section className="popular-frame rounded-[1.55rem] px-4 py-5 sm:px-5 sm:py-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <SectionHeading
                  description="Live launches with the strongest current on-chain profile across the active Arc Testnet set."
                  eyebrow="Featured"
                  title="Popular"
                />
                <MetricBadge
                  label="Ranking"
                  value={getMetricCountLabel(
                    state.data.popularMetricKind,
                    state.data.popularItems.length
                  )}
                />
              </div>

              {state.data.popularItems.length > 0 ? (
                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                  {state.data.popularItems.map((item) => (
                    <DiscoverTokenCard
                      item={item}
                      key={`popular-${item.launchId}-${item.tokenAddress}`}
                      metricKind={state.data.popularMetricKind}
                      metricLabel={state.data.popularMetricLabel}
                      variant="popular"
                    />
                  ))}
                </div>
              ) : (
                <SurfaceCard
                  className="mt-6 border-white/8 bg-white/[0.03]"
                  padding="sm"
                  tone="muted"
                >
                  <p className="text-sm text-[var(--text-secondary)]">
                    No ranking data is available yet. Popular launches will appear automatically as
                    LaunchFactory activity grows on Arc Testnet.
                  </p>
                </SurfaceCard>
              )}
            </section>

            <SurfaceCard className="space-y-6" tone="panel">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <SectionHeading
                  description="Discover tokens still moving through the LibrARC launch curve."
                  title="Explore"
                />

                <div className="min-w-0 space-y-3 xl:max-w-[52rem] xl:items-end">
                  <div className="overflow-x-auto">
                    <SegmentedControl
                      ariaLabel="Sort launches"
                      className="min-w-max"
                      onChange={(value) =>
                        setQuery((current) => ({
                          ...current,
                          page: 1,
                          sort: value
                        }))
                      }
                      options={[
                        { label: "Recent buys", value: "recentBuys" },
                        { label: "Newest", value: "newest" },
                        { label: "Oldest", value: "oldest" },
                        { label: "Market cap", value: "marketCap" },
                        { label: "Volume", value: "volume" }
                      ]}
                      value={query.sort}
                    />
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="overflow-x-auto">
                      <SegmentedControl
                        ariaLabel="Filter event metric time range"
                        className="min-w-max"
                        onChange={(value) =>
                          setQuery((current) => ({
                            ...current,
                            page: 1,
                            timeFilter: value
                          }))
                        }
                        options={[
                          { label: "All", value: "all" },
                          { label: "24h", value: "24h" },
                          { label: "7d", value: "7d" }
                        ]}
                        value={query.timeFilter}
                      />
                    </div>

                    <label className="flex min-w-0 items-center gap-3">
                      <span className="shrink-0 text-sm font-medium text-white">Status</span>
                      <select
                        className="field-shell min-w-[12rem] appearance-none py-0 text-sm"
                        onChange={(event) =>
                          setQuery((current) => ({
                            ...current,
                            page: 1,
                            status: event.target.value as ArcLaunchStatusFilter
                          }))
                        }
                        value={query.status}
                      >
                        <option value="all">All launches</option>
                        <option value="active">Active</option>
                        <option value="graduation-pending">Graduation pending</option>
                        <option value="graduated">Graduated</option>
                        <option value="paused">Paused</option>
                      </select>
                    </label>
                  </div>

                  <p className="text-xs leading-5 text-[var(--text-faint)]">
                    {usesEventRanking
                      ? "The selected time range is applied using canonical pool event timestamps."
                      : "Time range controls affect Recent buys and Volume rankings."}
                  </p>
                </div>
              </div>

              {state.data.warnings.length > 0 ? (
                <details className="rounded-[1rem] border border-[rgba(214,163,76,0.4)] bg-[rgba(214,163,76,0.08)] px-4 py-3">
                  <summary className="cursor-pointer list-none text-sm font-medium text-[color:var(--warning)]">
                    Partial read warnings
                  </summary>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {state.data.warnings.map((warning) => (
                      <li key={`${warning.label}-${warning.message}`}>
                        <span className="font-semibold text-white">{warning.label}:</span>{" "}
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {state.status === "empty" ? (
                <SurfaceCard className="border-white/8 bg-white/[0.03]" tone="muted">
                  <h3 className="text-lg font-semibold text-white" id="explore-title">
                    {state.data.totalLaunchCount === 0
                      ? "No launches are registered yet."
                      : "No launches matched this filter."}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {state.data.totalLaunchCount === 0
                      ? "New Arc Testnet launches will appear here automatically as soon as they are created."
                      : "Try a different search term, sort mode, or status filter."}
                  </p>
                  <div className="mt-4">
                    <Button href="/launch" size="sm">
                      Launch a token
                    </Button>
                  </div>
                </SurfaceCard>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <MetricBadge
                      label="Sort"
                      value={`${state.data.effectiveSortMetricLabel} · ${state.data.totalFilteredLaunches.toLocaleString("en-US")} results`}
                    />
                    <p className="text-sm text-[var(--text-muted)]">
                      Browse live LaunchFactory launches without connecting a wallet.
                    </p>
                  </div>

                  <div
                    className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                    id="explore-title"
                  >
                    {state.data.items.map((item) => (
                      <DiscoverTokenCard
                        item={item}
                        key={`explore-${item.launchId}-${item.tokenAddress}`}
                        metricKind={state.data.effectiveSortMetricKind}
                        metricLabel={state.data.effectiveSortMetricLabel}
                      />
                    ))}
                  </div>

                  <div className="flex flex-col gap-4 border-t border-white/6 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">
                        Page {state.data.currentPage} of {Math.max(state.data.totalPages, 1)}
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
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
              )}
            </SurfaceCard>
          </>
        ) : null}
      </Container>
    </section>
  );
}
