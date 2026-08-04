import Link from "next/link";

import { type ArcLaunchListItem, type ArcLaunchMetricKind } from "../../lib/arc/launches-api";
import { formatCompactAddress, formatPercentage, formatUsdcAmount } from "../../lib/arc/format";
import { Button } from "../ui/Button";
import { SurfaceCard } from "../ui/SurfaceCard";

type DiscoverTokenCardProps = {
  item: ArcLaunchListItem;
  metricKind: ArcLaunchMetricKind;
  metricLabel: string;
  variant?: "explore" | "popular";
};

function clampProgress(value: number | undefined) {
  return Math.max(0, Math.min(100, value ?? 0));
}

function formatUsdcMetric(value: string | undefined) {
  return value ? `${formatUsdcAmount(BigInt(value))} USDC` : "Unavailable";
}

function formatLaunchIdMetric(value: string) {
  return `Launch #${BigInt(value).toLocaleString("en-US")}`;
}

function formatRecentBuyMetric(item: ArcLaunchListItem) {
  return item.lastBuyBlockNumber
    ? `Block ${BigInt(item.lastBuyBlockNumber).toLocaleString("en-US")}`
    : "No buys yet";
}

function getMetricValue(item: ArcLaunchListItem, metricKind: ArcLaunchMetricKind) {
  if (metricKind === "marketCap") {
    return formatUsdcMetric(item.marketCap);
  }

  if (metricKind === "volume") {
    return formatUsdcMetric(item.volume);
  }

  if (metricKind === "realUsdcReserve") {
    return formatUsdcMetric(item.realUsdcReserve);
  }

  if (metricKind === "recentBuys") {
    return formatRecentBuyMetric(item);
  }

  return formatLaunchIdMetric(item.launchId);
}

function getSecondaryMetric(item: ArcLaunchListItem, metricKind: ArcLaunchMetricKind) {
  if (metricKind !== "realUsdcReserve" && item.realUsdcReserve) {
    return {
      label: "Reserve",
      value: formatUsdcMetric(item.realUsdcReserve)
    };
  }

  if (metricKind !== "marketCap" && item.marketCap) {
    return {
      label: "Market cap",
      value: formatUsdcMetric(item.marketCap)
    };
  }

  return null;
}

function getStatusLabel(item: ArcLaunchListItem) {
  if (item.hasCanonicalError) {
    return "Warning";
  }

  return item.poolStatusLabel ?? "Unknown";
}

function getStatusTone(item: ArcLaunchListItem) {
  if (item.hasCanonicalError) {
    return "border-rose-300/20 bg-rose-300/10 text-rose-100";
  }

  if (item.poolStatus === 2 || item.poolStatus === 3) {
    return "border-amber-300/20 bg-amber-300/10 text-amber-100";
  }

  return "border-[rgba(76,128,255,0.26)] bg-[rgba(50,108,255,0.12)] text-[rgb(214,225,255)]";
}

function getTileGradient(seed: string) {
  const normalized = seed.toUpperCase() || "AR";
  const checksum = [...normalized].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const hue = 210 + (checksum % 36);
  const secondaryHue = 220 + (checksum % 20);

  return `linear-gradient(145deg, hsla(${hue}, 68%, 58%, 0.28), hsla(${secondaryHue}, 36%, 24%, 0.92))`;
}

function getWarningTitle(item: ArcLaunchListItem) {
  return item.warnings.map((warning) => `${warning.label}: ${warning.message}`).join("\n");
}

export function DiscoverTokenCard({
  item,
  metricKind,
  metricLabel,
  variant = "explore"
}: DiscoverTokenCardProps) {
  const progress = clampProgress(item.graduationProgress);
  const secondaryMetric = getSecondaryMetric(item, metricKind);
  const tileSeed = item.symbol ?? item.name ?? item.tokenAddress;
  const tileText =
    (item.symbol ?? item.name ?? "AR").replace(/[^A-Z0-9]/gi, "").slice(0, 3) || "AR";

  return (
    <SurfaceCard
      className={[
        "group flex h-full flex-col justify-between border-[rgba(82,95,117,0.5)] transition duration-200 hover:-translate-y-0.5 hover:border-[rgba(76,128,255,0.4)] hover:shadow-[0_18px_40px_rgba(7,12,22,0.26)]",
        variant === "popular" ? "p-4 sm:p-4.5" : ""
      ].join(" ")}
      padding={variant === "popular" ? "sm" : "md"}
      tone="card"
    >
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div
              aria-hidden="true"
              className="mb-3 flex aspect-square w-full max-w-[5.25rem] items-end rounded-[1.15rem] border border-white/8 p-3 text-[1.2rem] font-black tracking-[0.18em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              style={{ background: getTileGradient(tileSeed) }}
            >
              {tileText.toUpperCase()}
            </div>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[1.02rem] font-semibold text-white">
                  {item.name ?? "Unavailable launch"}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-[var(--text-faint)]">
                  {item.symbol ?? "UNKNOWN"}
                </p>
              </div>
              {item.warnings.length > 0 ? (
                <span
                  aria-label="Launch warning present"
                  className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-[color:var(--warning)] shadow-[0_0_0_4px_rgba(214,163,76,0.12)]"
                  role="img"
                  title={getWarningTitle(item)}
                />
              ) : null}
            </div>
          </div>

          <span
            className={[
              "inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[0.63rem] font-semibold uppercase tracking-[0.18em]",
              getStatusTone(item)
            ].join(" ")}
          >
            {getStatusLabel(item)}
          </span>
        </div>

        <div className="rounded-[1rem] border border-white/6 bg-[rgba(255,255,255,0.03)] px-3.5 py-3">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[var(--text-faint)]">
            {metricLabel}
          </p>
          <p className="mt-2 text-[1rem] font-semibold text-white">
            {getMetricValue(item, metricKind)}
          </p>
          {secondaryMetric ? (
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {secondaryMetric.label}: {secondaryMetric.value}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-[var(--text-muted)]">Graduation</span>
            <span className="font-semibold text-white">{formatPercentage(progress)}</span>
          </div>
          <div className="progress-track">
            <span className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="truncate text-[var(--text-muted)]">
            {formatCompactAddress(item.tokenAddress)}
          </span>
          <Link
            className="shrink-0 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[var(--text-faint)] transition hover:text-white"
            href={item.tokenExplorerUrl}
            rel="noreferrer"
            target="_blank"
          >
            Explorer
          </Link>
        </div>
      </div>

      <div className="mt-5">
        <Button className="w-full" href={item.tokenPageUrl} size="sm">
          Open token
        </Button>
      </div>
    </SurfaceCard>
  );
}
