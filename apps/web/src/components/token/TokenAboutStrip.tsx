"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { type ArcTokenApiSuccess } from "../../lib/arc/token-api";
import {
  arcDeployment,
  formatCompactAddress,
  formatCompactUsdcAmount,
  formatPercentage,
  formatUsdcAmount,
  useArcExplorerLinks
} from "../../lib/arc/hooks";
import {
  buildTokenAboutActions,
  copyTokenAddressWithFeedback,
  getTokenAddressCopyPresentation,
  type TokenAddressCopyStatus
} from "../../lib/arc/token-address-copy";
import { AddressDisplayRow } from "../ui/AddressDisplayRow";
import { SurfaceCard } from "../ui/SurfaceCard";

type TokenAboutStripProps = {
  data: ArcTokenApiSuccess;
};

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="inline-flex min-h-8 items-center rounded-full border border-[rgba(82,95,117,0.46)] bg-[rgba(255,255,255,0.02)] px-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)] transition hover:border-[rgba(76,128,255,0.34)] hover:bg-[rgba(76,128,255,0.08)] hover:text-white"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </Link>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="inline-flex min-h-7 items-center rounded-full border border-[rgba(82,95,117,0.42)] bg-[rgba(255,255,255,0.02)] px-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
      {children}
    </span>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[0.95rem] border border-[rgba(82,95,117,0.4)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
        {label}
      </p>
      <p className="mt-1.5 text-sm font-semibold text-white tabular-nums">{value}</p>
    </div>
  );
}

export function TokenAboutStrip({ data }: TokenAboutStripProps) {
  const [contractCopyStatus, setContractCopyStatus] = useState<TokenAddressCopyStatus>("idle");
  const contractCopyResetHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const explorerLinks = useArcExplorerLinks(data.token.address, data.pool.address);
  const creatorExplorerUrl = data.about.creator
    ? `${arcDeployment.explorerUrl}/address/${data.about.creator}`
    : undefined;
  const headlineMetric = data.about.marketCap
    ? `${formatCompactUsdcAmount(BigInt(data.about.marketCap))} USDC`
    : `${formatCompactUsdcAmount(BigInt(data.pool.curveState.realUsdcReserve))} USDC`;
  const headlineLabel = data.about.marketCap ? "Market cap" : "Real reserve";
  const contractCopyPresentation = getTokenAddressCopyPresentation(contractCopyStatus);
  const aboutActions = buildTokenAboutActions({
    contractCopyStatus,
    creatorExplorerUrl,
    discord: data.about.discord,
    poolExplorerUrl: explorerLinks.poolExplorerUrl,
    telegram: data.about.telegram,
    tokenAddress: data.token.address,
    tokenExplorerUrl: explorerLinks.tokenExplorerUrl,
    website: data.about.website,
    x: data.about.x
  });
  const description =
    data.about.description ??
    "No off-chain description is attached to this launch yet. Arc Testnet market data below comes from the canonical LibrARC contracts.";

  useEffect(() => {
    return () => {
      if (contractCopyResetHandleRef.current) {
        clearTimeout(contractCopyResetHandleRef.current);
      }
    };
  }, []);

  async function handleContractCopy() {
    const result = await copyTokenAddressWithFeedback({
      address: data.token.address,
      clearScheduledReset: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      currentResetHandle: contractCopyResetHandleRef.current,
      onStatusChange: setContractCopyStatus
    });

    contractCopyResetHandleRef.current =
      (result.nextResetHandle as ReturnType<typeof setTimeout> | null) ?? null;
  }

  return (
    <div className="space-y-3.5">
      <SurfaceCard
        className="overflow-hidden border-[rgba(82,95,117,0.5)] bg-[linear-gradient(180deg,rgba(76,128,255,0.045),rgba(28,34,45,0.97)_16%,rgba(20,25,34,0.99))]"
        padding="md"
        tone="card"
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.9fr)] xl:items-start">
          <div className="min-w-0 space-y-3.5">
            <div className="space-y-2.5">
              <p className="eyebrow">About</p>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-[1.55rem] font-semibold tracking-tight text-white sm:text-[1.85rem]">
                  {data.token.name}
                </h1>
                <span className="rounded-full border border-[rgba(82,95,117,0.48)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-sm font-semibold text-white">
                  ${data.token.symbol}
                </span>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
                {description}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge>{data.pool.statusLabel}</Badge>
              {data.about.creator ? (
                <Badge>{`Creator ${formatCompactAddress(data.about.creator)}`}</Badge>
              ) : null}
              {data.about.launchId ? <Badge>{`Launch #${data.about.launchId}`}</Badge> : null}
            </div>
          </div>

          <div className="min-w-0 space-y-3">
            <div className="rounded-[1.15rem] border border-[rgba(82,95,117,0.44)] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                    {headlineLabel}
                  </p>
                  <p
                    className="mt-2 text-[1.45rem] font-semibold tracking-tight text-white tabular-nums sm:text-[1.75rem]"
                    title={
                      data.about.marketCap
                        ? `${formatUsdcAmount(BigInt(data.about.marketCap))} USDC`
                        : `${formatUsdcAmount(BigInt(data.pool.curveState.realUsdcReserve))} USDC`
                    }
                  >
                    {headlineMetric}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-[var(--text-secondary)]">
                    Source-backed Arc Testnet launch data from the canonical LaunchFactory and
                    LaunchPool.
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <SummaryMetric
                  label="Graduation"
                  value={formatPercentage(data.pool.graduationProgress)}
                />
                <SummaryMetric
                  label="Protocol fees"
                  value={`${formatCompactUsdcAmount(BigInt(data.pool.curveState.accruedProtocolFees))} USDC`}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {aboutActions.map((action) =>
                action.kind === "link" ? (
                  <ActionLink href={action.href} key={action.key} label={action.label} />
                ) : (
                  <button
                    aria-label={action.ariaLabel}
                    className="inline-flex min-h-8 items-center rounded-full border border-[rgba(82,95,117,0.46)] bg-[rgba(255,255,255,0.02)] px-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)] transition hover:border-[rgba(76,128,255,0.34)] hover:bg-[rgba(76,128,255,0.08)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!action.address}
                    key={action.key}
                    onClick={() => {
                      void handleContractCopy();
                    }}
                    title={action.title}
                    type="button"
                  >
                    {action.label}
                  </button>
                )
              )}
              <span aria-live="polite" className="sr-only">
                {contractCopyPresentation.liveMessage}
              </span>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <details className="rounded-[1rem] border border-[rgba(82,95,117,0.42)] bg-[rgba(255,255,255,0.02)] px-4 py-3.5">
        <summary className="cursor-pointer text-sm font-semibold text-white">
          Contract details
        </summary>
        <div className="mt-3.5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AddressDisplayRow
            copyAriaLabel="Copy token contract address"
            copyButtonLabel={contractCopyPresentation.buttonLabel}
            href={explorerLinks.tokenExplorerUrl}
            label="Token"
            onCopy={() => {
              void handleContractCopy();
            }}
            value={data.token.address}
          />
          <AddressDisplayRow
            href={explorerLinks.poolExplorerUrl}
            label="Pool"
            value={data.pool.address}
          />
          <AddressDisplayRow
            href={explorerLinks.factoryExplorerUrl}
            label="Factory"
            value={data.deployment.factoryAddress}
          />
          <AddressDisplayRow
            href={explorerLinks.feeVaultExplorerUrl}
            label="FeeVault"
            value={data.deployment.feeVaultAddress}
          />
          <AddressDisplayRow
            href={explorerLinks.usdcExplorerUrl}
            label="Quote asset"
            value={data.pool.quoteAsset}
          />
          <AddressDisplayRow
            href={explorerLinks.stagingAdapterExplorerUrl}
            label="Staging adapter"
            value={data.deployment.stagingAdapterAddress}
          />
        </div>
        <div className="mt-3.5 rounded-[0.95rem] border border-[rgba(82,95,117,0.42)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm leading-6 text-[var(--text-secondary)]">
          Arc Testnet staging adapter only. It is not a live DEX venue.
        </div>
      </details>
    </div>
  );
}
