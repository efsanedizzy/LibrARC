import { formatCompactUsdcAmount, formatUsdcAmount } from "../../lib/arc/hooks";
import { type ArcTokenApiSuccess } from "../../lib/arc/token-api";
import { SurfaceCard } from "../ui/SurfaceCard";

type TokenMarketSnapshotProps = {
  about?: ArcTokenApiSuccess["about"];
  isLoading: boolean;
  pool: ArcTokenApiSuccess["pool"] | undefined;
};

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
        {label}
      </p>
      <p className="mt-1.5 truncate text-sm font-semibold text-white tabular-nums sm:text-[0.96rem]">
        {value}
      </p>
    </div>
  );
}

function TimeframePill({ active = false, label }: { active?: boolean; label: string }) {
  return (
    <span
      className={[
        "inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold uppercase tracking-[0.18em]",
        active
          ? "border-[rgba(76,128,255,0.36)] bg-[rgba(76,128,255,0.12)] text-white"
          : "border-[rgba(82,95,117,0.42)] bg-[rgba(255,255,255,0.02)] text-[var(--text-faint)]"
      ].join(" ")}
    >
      {label}
    </span>
  );
}

export function TokenMarketSnapshot({ about, isLoading, pool }: TokenMarketSnapshotProps) {
  const marketCapValue = about?.marketCap
    ? `${formatCompactUsdcAmount(BigInt(about.marketCap))} USDC`
    : "Unavailable";
  const liquidityValue = pool?.curveState.realUsdcReserve
    ? `${formatCompactUsdcAmount(BigInt(pool.curveState.realUsdcReserve))} USDC`
    : "Unavailable";
  const volumeValue = "Unavailable";
  const athValue = "Unavailable";
  const headlineValue = about?.marketCap
    ? `${formatCompactUsdcAmount(BigInt(about.marketCap))} USDC`
    : liquidityValue;
  const remainingCapacity = pool?.remainingGraduationCapacity
    ? `${formatCompactUsdcAmount(BigInt(pool.remainingGraduationCapacity))} USDC`
    : "Unavailable";
  const protocolFees = pool?.curveState.accruedProtocolFees
    ? `${formatCompactUsdcAmount(BigInt(pool.curveState.accruedProtocolFees))} USDC`
    : "Unavailable";

  return (
    <div className="space-y-4">
      <SurfaceCard
        className="overflow-hidden border-[rgba(82,95,117,0.44)] bg-[rgba(255,255,255,0.02)] !p-0"
        padding="sm"
        tone="card"
      >
        <div className="grid divide-y divide-[rgba(82,95,117,0.32)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <StatCell label="Market cap" value={isLoading ? "Loading..." : marketCapValue} />
          <StatCell label="Liquidity" value={isLoading ? "Loading..." : liquidityValue} />
          <StatCell label="24h volume" value={isLoading ? "Loading..." : volumeValue} />
          <StatCell label="ATH" value={isLoading ? "Loading..." : athValue} />
        </div>
      </SurfaceCard>

      <SurfaceCard
        className="relative overflow-hidden border-[rgba(82,95,117,0.5)] bg-[linear-gradient(180deg,rgba(76,128,255,0.04),rgba(32,39,51,0.95)_14%,rgba(20,25,34,0.98))]"
        padding="md"
        tone="card"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(76,128,255,0.08),transparent_30%)]" />
        <div className="relative flex min-h-[34rem] flex-col gap-6 xl:min-h-[41rem]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2.5">
              <p className="eyebrow">Market</p>
              <div className="flex flex-wrap items-end gap-3">
                <h2
                  className="text-[1.95rem] font-semibold tracking-tight text-white sm:text-[2.4rem]"
                  title={
                    about?.marketCap
                      ? `${formatUsdcAmount(BigInt(about.marketCap))} USDC`
                      : pool?.curveState.realUsdcReserve
                        ? `${formatUsdcAmount(BigInt(pool.curveState.realUsdcReserve))} USDC`
                        : "Unavailable"
                  }
                >
                  {isLoading ? "Loading..." : headlineValue}
                </h2>
                <span className="rounded-full border border-[rgba(82,95,117,0.42)] bg-[rgba(255,255,255,0.02)] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                  Spot view
                </span>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                Source-backed LaunchPool metrics. Historical indexing is still pending, so the chart
                area stays truthful and does not invent synthetic candles or fake volume.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <TimeframePill label="5M" />
              <TimeframePill label="1H" />
              <TimeframePill label="6H" />
              <TimeframePill label="1D" />
              <TimeframePill active label="ALL" />
            </div>
          </div>

          <div className="rounded-[1.35rem] border border-[rgba(82,95,117,0.42)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:p-5">
            <div className="subtle-grid flex min-h-[23rem] items-center justify-center rounded-[1.1rem] border border-[rgba(82,95,117,0.28)] bg-[rgba(17,22,30,0.72)] px-6 py-10 xl:min-h-[30rem]">
              <div className="max-w-xl text-center">
                <p className="text-xl font-semibold text-white">Price history will render here.</p>
                <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                  The center column preserves the full chart footprint and timeframe controls while
                  indexed price history is unavailable.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[0.95rem] border border-[rgba(82,95,117,0.4)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                Remaining graduation capacity
              </p>
              <p className="mt-1.5 text-sm font-semibold text-white">{remainingCapacity}</p>
            </div>
            <div className="rounded-[0.95rem] border border-[rgba(82,95,117,0.4)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                Protocol fees
              </p>
              <p className="mt-1.5 text-sm font-semibold text-white">{protocolFees}</p>
            </div>
          </div>
        </div>
      </SurfaceCard>
    </div>
  );
}
