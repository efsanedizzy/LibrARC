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
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

type LaunchBrowserState =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: ArcLaunchesApiSuccess; error: null }
  | { status: "empty"; data: ArcLaunchesApiSuccess; error: null }
  | { status: "rpc-unavailable" | "invalid-request"; data: null; error: ArcLaunchesApiError };

const DEFAULT_PAGE_SIZE = 12;

function formatReserve(value: string | undefined) {
  return value ? `${formatUsdcAmount(BigInt(value))} USDC` : "Unavailable";
}

function getLaunchStateTone(item: ArcLaunchListItem) {
  if (item.hasCanonicalError) {
    return "border-rose-300/20 bg-rose-300/10 text-rose-100";
  }

  if (item.poolStatus === 2) {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }

  if (item.poolStatus === 3) {
    return "border-slate-400/20 bg-slate-400/10 text-slate-200";
  }

  if (item.canBuy === false || item.canSell === false) {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }

  return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
}

function LoadingCard() {
  return (
    <Card className="h-full animate-pulse space-y-4">
      <div className="h-4 w-24 rounded-full bg-white/10" />
      <div className="h-8 w-40 rounded-full bg-white/10" />
      <div className="h-4 w-32 rounded-full bg-white/10" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-20 rounded-[1.25rem] bg-white/8" />
        <div className="h-20 rounded-[1.25rem] bg-white/8" />
      </div>
      <div className="h-11 w-36 rounded-full bg-white/10" />
    </Card>
  );
}

function LaunchCard({ item }: { item: ArcLaunchListItem }) {
  return (
    <article>
      <Card className="flex h-full flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
              Launch #{item.launchId}
            </p>
            <h3 className="mt-3 break-words text-2xl font-semibold tracking-tight text-white">
              {item.name ?? "Unavailable launch"}
            </h3>
            <p className="mt-2 break-words text-sm text-slate-400">
              ${item.symbol ?? "UNKNOWN"} • {formatCompactAddress(item.tokenAddress)}
            </p>
          </div>
          <span
            className={[
              "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]",
              getLaunchStateTone(item)
            ].join(" ")}
          >
            {item.poolStatusLabel ?? "Launch warning"}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Creator</p>
            <p className="mt-2 text-sm font-semibold text-white">
              {formatCompactAddress(item.creator)}
            </p>
            <p className="mt-2 text-xs text-slate-400">{item.creatorExplorerUrl}</p>
          </div>
          <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Real USDC reserve</p>
            <p className="mt-2 text-sm font-semibold text-white">
              {formatReserve(item.realUsdcReserve)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Graduation {formatPercentage(item.graduationProgress ?? 0)}
            </p>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.25rem] border border-white/10 bg-white/4 p-4">
            <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Buying</dt>
            <dd className="mt-2 text-sm font-semibold text-white">
              {item.canBuy === undefined ? "Unavailable" : item.canBuy ? "Available" : "Paused"}
            </dd>
          </div>
          <div className="rounded-[1.25rem] border border-white/10 bg-white/4 p-4">
            <dt className="text-xs uppercase tracking-[0.2em] text-slate-500">Selling</dt>
            <dd className="mt-2 text-sm font-semibold text-white">
              {item.canSell === undefined ? "Unavailable" : item.canSell ? "Available" : "Paused"}
            </dd>
          </div>
        </dl>

        {item.warnings.length > 0 ? (
          <div className="rounded-[1.25rem] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
            {item.hasCanonicalError
              ? "This launch has a canonical resolution warning."
              : "Some optional launch reads were unavailable."}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-3">
          <Button href={item.tokenPageUrl}>Open token page</Button>
          <Button href={item.tokenExplorerUrl} rel="noreferrer" target="_blank" variant="secondary">
            View token
          </Button>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-cyan-200 transition hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            href={item.poolExplorerUrl}
            rel="noreferrer"
            target="_blank"
          >
            Pool explorer
          </Link>
        </div>
      </Card>
    </article>
  );
}

function ErrorState({ error, onRetry }: { error: ArcLaunchesApiError; onRetry: () => void }) {
  return (
    <Card className="space-y-4 rounded-[1.5rem] border-rose-300/20 bg-rose-300/10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rose-100/80">
          {error.code === "INVALID_REQUEST" ? "Invalid request" : "RPC unavailable"}
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">{error.message}</h3>
      </div>
      <details className="rounded-[1.25rem] border border-white/10 bg-slate-950/60 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-white">
          Technical details
        </summary>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
          {error.details.map((detail) => (
            <li key={`${detail.label}-${detail.message}`}>
              <span className="font-semibold text-white">{detail.label}:</span> {detail.message}
            </li>
          ))}
        </ul>
      </details>
      <div>
        <Button onClick={onRetry} type="button">
          Retry
        </Button>
      </div>
    </Card>
  );
}

export function LaunchBrowser() {
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

  const totalLaunchCount = state.data?.totalLaunchCount ?? 0;
  const helperCopy =
    query.search || query.status !== "all"
      ? "Searches use a bounded server scan so Discover stays responsive as the factory grows."
      : "Launch cards are resolved directly from the active Arc Testnet LaunchFactory.";

  return (
    <section
      aria-labelledby="discover-title"
      className="pb-20 pt-16 sm:pb-24 sm:pt-20"
      id="discover"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
              Discover launches
            </p>
            <h2
              className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl"
              id="discover-title"
            >
              Live Arc Testnet launches registered by the verified LaunchFactory.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400">{helperCopy}</p>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/4 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Factory launches</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
              {state.status === "loading" ? "..." : totalLaunchCount.toLocaleString("en-US")}
            </p>
          </div>
        </div>

        <Card className="mt-10 space-y-5 rounded-[1.75rem]">
          <form
            className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery((current) => ({
                ...current,
                page: 1,
                search: searchInput.trim()
              }));
            }}
          >
            <label className="space-y-2">
              <span className="text-sm font-semibold text-white">Search launches</span>
              <input
                className="min-h-11 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Name, symbol, token, creator, or pool address"
                type="search"
                value={searchInput}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-white">Sort</span>
              <select
                className="min-h-11 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/45"
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

            <label className="space-y-2">
              <span className="text-sm font-semibold text-white">Status</span>
              <select
                className="min-h-11 w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/45"
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

            <div className="flex items-end gap-3">
              <Button className="w-full lg:w-auto" type="submit">
                Search
              </Button>
              <Button
                className="w-full lg:w-auto"
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
            <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <LoadingCard key={index} />
              ))}
            </div>
          ) : null}

          {state.status === "rpc-unavailable" || state.status === "invalid-request" ? (
            <ErrorState
              error={state.error}
              onRetry={() => {
                setRetryNonce((value) => value + 1);
              }}
            />
          ) : null}

          {state.status === "empty" && state.data ? (
            <Card className="space-y-4 rounded-[1.5rem] border-white/10 bg-white/4">
              <h3 className="text-2xl font-semibold tracking-tight text-white">
                {state.data.totalLaunchCount === 0
                  ? "No launches are registered yet."
                  : "No launches matched this filter."}
              </h3>
              <p className="text-sm leading-6 text-slate-400">
                {state.data.totalLaunchCount === 0
                  ? "New Factory launches will appear here automatically as soon as they are created on Arc Testnet."
                  : "Adjust the search term, sort order, or status filter and try again."}
              </p>
            </Card>
          ) : null}

          {state.data?.warnings.length ? (
            <div className="rounded-[1.25rem] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
              {state.data.warnings[0]?.message}
            </div>
          ) : null}

          {state.status === "success" && state.data ? (
            <>
              <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                {state.data.items.map((item) => (
                  <LaunchCard item={item} key={`${item.launchId}-${item.tokenAddress}`} />
                ))}
              </div>

              <div className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-400">
                  Page {state.data.currentPage} of {Math.max(state.data.totalPages, 1)}
                </p>
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
        </Card>
      </div>
    </section>
  );
}
