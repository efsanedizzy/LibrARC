import type { Address } from "viem";

import { arcDeployment } from "../../lib/arc/config";
import { formatLaunchTokenAmount } from "../../lib/arc/format";
import { arcTestnet } from "../../lib/chains/arc-testnet";
import { Card } from "../ui/Card";
import type { LaunchFormValues } from "./types";
import { getDisplayValue } from "./validation";

type LaunchSummaryProps = {
  connectedWalletAddress?: Address;
  imagePreviewUrl?: string | null;
  initialPurchaseAmount: string | null;
  minimumTokenAmountOut: string | null;
  paused: boolean;
  purchaseMode: "createLaunch" | "createLaunchAndBuy";
  telegram?: string;
  values: LaunchFormValues;
  xProfile?: string;
};

type SummaryRowProps = {
  label: string;
  title?: string;
  truncate?: boolean;
  value: string;
};

function formatWalletAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-5)}`;
}

function SummaryRow({ label, title, truncate = false, value }: SummaryRowProps) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 border-b border-white/8 pb-3 last:border-b-0 last:pb-0">
      <dt className="shrink-0 text-sm text-slate-400">{label}</dt>
      <dd
        className={[
          "min-w-0 text-right text-sm font-medium text-white",
          truncate ? "overflow-hidden text-ellipsis whitespace-nowrap" : "break-words"
        ].join(" ")}
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}

export function LaunchSummary({
  connectedWalletAddress,
  imagePreviewUrl,
  initialPurchaseAmount,
  minimumTokenAmountOut,
  paused,
  purchaseMode,
  telegram,
  values,
  xProfile
}: LaunchSummaryProps) {
  const tokenName = getDisplayValue(values.name) || "Your token";
  const tokenSymbol = getDisplayValue(values.symbol) || "ticker";
  const description =
    getDisplayValue(values.description) || "A short token description will appear here.";
  const creatorWalletValue = connectedWalletAddress
    ? connectedWalletAddress
    : "Connected wallet will be used";
  const isWalletAddress = creatorWalletValue.startsWith("0x");
  const creatorWallet = isWalletAddress
    ? formatWalletAddress(creatorWalletValue)
    : creatorWalletValue;
  const hasSocials = Boolean(xProfile || telegram);

  return (
    <Card className="overflow-hidden border-[rgba(82,95,117,0.48)] bg-[linear-gradient(180deg,rgba(76,128,255,0.06),rgba(20,25,34,0.98)_26%,rgba(18,23,32,0.99))] shadow-[0_18px_36px_rgba(7,12,22,0.24)]">
      <div className="space-y-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-18 w-18 shrink-0 items-center justify-center overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/80">
            {imagePreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Token artwork preview"
                className="h-full w-full object-cover"
                src={imagePreviewUrl}
              />
            ) : (
              <span className="text-lg font-semibold tracking-[0.2em] text-cyan-100">
                {tokenSymbol.slice(0, 4) || "ARC"}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
              Preview
            </p>
            <h2 className="mt-2 truncate text-[1.55rem] font-semibold tracking-tight text-white">
              {tokenName}
            </h2>
            <p className="mt-1 break-words text-sm text-slate-400">${tokenSymbol}</p>
          </div>
        </div>

        <div className="rounded-[1.15rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-3.5">
          <p className="text-sm leading-6 text-slate-300">{description}</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-[1rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3.5 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Launch fee
            </p>
            <p className="mt-2 text-sm font-semibold text-white">Configuration pending</p>
          </div>
          <div className="rounded-[1rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3.5 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Trading fees
            </p>
            <p className="mt-2 text-sm font-semibold text-white">Curve-managed</p>
          </div>
          <div className="rounded-[1rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3.5 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Graduation
            </p>
            <p className="mt-2 text-sm font-semibold text-white">
              {paused ? "Paused" : "Curve threshold"}
            </p>
          </div>
          <div className="rounded-[1rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-3.5 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Liquidity
            </p>
            <p className="mt-2 text-sm font-semibold text-white">Locked after graduation</p>
          </div>
        </div>

        <dl className="space-y-3 rounded-[1.15rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-4">
          <SummaryRow
            label="Developer buy"
            value={initialPurchaseAmount ? `${initialPurchaseAmount.trim()} USDC` : "Not set"}
          />
          <SummaryRow
            label="Minimum tokens"
            value={
              minimumTokenAmountOut ? formatLaunchTokenAmount(BigInt(minimumTokenAmountOut)) : "N/A"
            }
          />
          <SummaryRow
            label="Creator wallet"
            title={isWalletAddress ? creatorWalletValue : undefined}
            truncate={isWalletAddress}
            value={creatorWallet}
          />
          <SummaryRow label="Network" value={arcTestnet.name} />
          <SummaryRow label="Gas token" value={arcTestnet.nativeCurrency.symbol} />
          <SummaryRow label="Launch path" value={purchaseMode} />
        </dl>

        {hasSocials ? (
          <div className="rounded-[1.15rem] border border-white/8 bg-[rgba(255,255,255,0.03)] px-4 py-3.5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
              Socials
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-slate-300">
              {xProfile ? (
                <span className="rounded-full border border-white/10 px-2.5 py-1">X ready</span>
              ) : null}
              {telegram ? (
                <span className="rounded-full border border-white/10 px-2.5 py-1">
                  Telegram ready
                </span>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="rounded-[1.15rem] border border-white/8 bg-slate-950/55 px-4 py-3.5">
          <p className="text-xs leading-6 text-slate-400">
            Factory {formatWalletAddress(arcDeployment.factoryAddress)} is used for the verified Arc
            Testnet launch flow.
          </p>
        </div>
      </div>
    </Card>
  );
}
