"use client";

import Link from "next/link";

import { parseAddress } from "../../lib/arc/config";
import { arcDeployment, useArcExplorerLinks, useArcTokenPageData } from "../../lib/arc/hooks";
import { type ArcTokenApiError } from "../../lib/arc/token-api";
import { Container } from "../layout/Container";
import { Button } from "../ui/Button";
import { SurfaceCard } from "../ui/SurfaceCard";
import { TokenAboutStrip } from "./TokenAboutStrip";
import { TokenActivityPanel } from "./TokenActivityPanel";
import { TokenMarketSnapshot } from "./TokenMarketSnapshot";
import { TokenTradePanel } from "./TokenTradePanel";
import { TokenChatPanel } from "./chat/TokenChatPanel";

type TokenDetailsClientProps = {
  address: string;
};

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
    <SurfaceCard
      className="border-[rgba(213,109,120,0.45)] bg-[rgba(213,109,120,0.08)]"
      padding="lg"
    >
      <div className="space-y-5">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
        <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{summary}</p>
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
    </SurfaceCard>
  );
}

function LoadingBlock({ className = "" }: { className?: string }) {
  return (
    <SurfaceCard className={`animate-pulse ${className}`} tone="card">
      <div className="h-full min-h-[10rem] rounded-[var(--radius-md)] bg-white/[0.04]" />
    </SurfaceCard>
  );
}

function BackAction() {
  return (
    <button
      className="inline-flex min-h-9 items-center gap-2 rounded-[0.85rem] border border-[var(--border-soft)] bg-[rgba(255,255,255,0.02)] px-3.5 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-strong)] hover:text-white"
      onClick={() => {
        if (window.history.length > 1) {
          window.history.back();
          return;
        }

        window.location.href = "/";
      }}
      type="button"
    >
      <span aria-hidden="true">←</span>
      Back
    </button>
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

export function TokenDetailsClient({ address }: TokenDetailsClientProps) {
  const tokenAddress = parseAddress(address);
  const { retry, state } = useArcTokenPageData(address);
  const readyData = state.status === "ready" ? state.data : null;
  const poolAddress = readyData?.pool.address;
  const explorerLinks = useArcExplorerLinks(tokenAddress ?? undefined, poolAddress);

  if (!tokenAddress) {
    return (
      <main className="flex-1 py-12 sm:py-16">
        <Container className="space-y-6">
          <BackAction />
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
      <main className="flex-1 py-12 sm:py-16">
        <Container className="space-y-6">
          <BackAction />
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
      <main className="flex-1 py-12 sm:py-16">
        <Container className="space-y-6">
          <BackAction />
          <SurfaceCard
            className="border-[rgba(214,163,76,0.45)] bg-[rgba(214,163,76,0.08)]"
            padding="lg"
          >
            <div className="space-y-4">
              <p className="eyebrow">Unregistered token</p>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                This address is not registered as a LibrARC launch token.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                The active LaunchFactory explicitly returned false for this token address on Arc
                Testnet, so the trading interface is intentionally unavailable here.
              </p>
              <div className="flex flex-wrap gap-3">
                {explorerLinks.tokenExplorerUrl ? (
                  <Link
                    className="inline-flex min-h-10 items-center rounded-[0.9rem] border border-[var(--border-soft)] px-4 text-sm font-semibold text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-strong)] hover:text-white"
                    href={explorerLinks.tokenExplorerUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View token on ArcScan
                  </Link>
                ) : null}
                <Button href="/" variant="secondary">
                  Back to Discover
                </Button>
              </div>
            </div>
          </SurfaceCard>
        </Container>
      </main>
    );
  }

  const isLoading = state.status === "loading";
  const token = readyData?.token;
  const warnings = readyData?.warnings ?? [];

  return (
    <main className="flex-1 py-7 sm:py-9">
      <Container className="max-w-[90rem] space-y-4 sm:space-y-5">
        <BackAction />

        {readyData ? (
          <TokenAboutStrip data={readyData} />
        ) : (
          <LoadingBlock className="min-h-[12.5rem] rounded-[1.25rem]" />
        )}

        {warnings.length > 0 ? (
          <details className="rounded-[var(--radius-md)] border border-[rgba(214,163,76,0.45)] bg-[rgba(214,163,76,0.08)] px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-[color:var(--warning)]">
              Partial read warning
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
        ) : null}

        {isLoading && !readyData ? (
          <div className="grid gap-5 lg:grid-cols-[21.25rem_minmax(0,1fr)] xl:grid-cols-[21.25rem_minmax(0,1fr)_21rem] xl:gap-6">
            <LoadingBlock className="min-h-[42rem] rounded-[1.3rem]" />
            <div className="space-y-4">
              <LoadingBlock className="min-h-[4.5rem] rounded-[1.2rem]" />
              <LoadingBlock className="min-h-[37rem] rounded-[1.3rem]" />
            </div>
            <LoadingBlock className="min-h-[42rem] rounded-[1.3rem] xl:col-start-3 xl:row-start-1" />
          </div>
        ) : null}

        {readyData ? (
          <>
            <div className="grid gap-5 lg:grid-cols-[21.25rem_minmax(0,1fr)] xl:grid-cols-[21.25rem_minmax(0,1fr)_21rem] xl:gap-6">
              <div className="order-1 lg:self-start xl:sticky xl:top-24">
                <TokenTradePanel
                  data={readyData}
                  isPageLoading={isLoading}
                  onRefresh={retry}
                  tokenAddress={tokenAddress}
                />
              </div>

              <div className="order-2 min-w-0">
                <TokenMarketSnapshot
                  about={readyData.about}
                  isLoading={isLoading}
                  pool={readyData.pool}
                />
              </div>

              <div className="order-3 min-w-0 lg:col-span-2 xl:order-3 xl:col-span-1 xl:sticky xl:top-24 xl:self-start">
                <TokenChatPanel
                  creatorAddress={readyData.about.creator}
                  tokenAddress={tokenAddress}
                />
              </div>
            </div>

            <div className="pt-1">
              <TokenActivityPanel
                poolExplorerUrl={explorerLinks.poolExplorerUrl}
                tokenAddress={tokenAddress}
                tokenExplorerUrl={explorerLinks.tokenExplorerUrl}
                tokenSymbol={token?.symbol}
              />
            </div>
          </>
        ) : null}
      </Container>
    </main>
  );
}
