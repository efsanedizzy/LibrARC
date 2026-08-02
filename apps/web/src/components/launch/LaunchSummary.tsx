import type { Address } from "viem";

import { arcDeployment } from "../../lib/arc/config";
import { formatLaunchTokenAmount } from "../../lib/arc/format";
import { arcTestnet } from "../../lib/chains/arc-testnet";
import { Card } from "../ui/Card";
import type { LaunchFormValues } from "./types";
import { getDisplayValue } from "./validation";

type LaunchSummaryProps = {
  connectedWalletAddress?: Address;
  initialPurchaseAmount: string | null;
  maxMetadataUriLength: number | null;
  metadataUriByteLength: number;
  minimumTokenAmountOut: string | null;
  paused: boolean;
  purchaseMode: "createLaunch" | "createLaunchAndBuy";
  values: LaunchFormValues;
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
  initialPurchaseAmount,
  maxMetadataUriLength,
  metadataUriByteLength,
  minimumTokenAmountOut,
  paused,
  purchaseMode,
  values
}: LaunchSummaryProps) {
  const tokenName = getDisplayValue(values.name) || "Unnamed token";
  const tokenSymbol = getDisplayValue(values.symbol) || "SYMBOL";
  const description = getDisplayValue(values.description) || "No description provided";
  const creatorWalletValue = connectedWalletAddress
    ? connectedWalletAddress
    : "Connected wallet will be used";
  const isWalletAddress = creatorWalletValue.startsWith("0x");
  const creatorWallet = isWalletAddress
    ? formatWalletAddress(creatorWalletValue)
    : creatorWalletValue;

  return (
    <Card className="space-y-6">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-18 w-18 items-center justify-center rounded-[1.4rem] border border-white/10 bg-slate-950/80">
          <span className="text-lg font-semibold tracking-[0.2em] text-cyan-100">
            {tokenSymbol.slice(0, 4) || "ARC"}
          </span>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
            Launch summary
          </p>
          <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight text-white">
            {tokenName}
          </h2>
          <p className="mt-1 break-words text-sm text-slate-400">${tokenSymbol}</p>
        </div>
      </div>

      <dl className="space-y-3">
        <SummaryRow label="Description" value={description} />
        <SummaryRow
          label="Creator wallet"
          title={isWalletAddress ? creatorWalletValue : undefined}
          truncate={isWalletAddress}
          value={creatorWallet}
        />
        <SummaryRow
          label="Initial purchase"
          value={initialPurchaseAmount ? `${initialPurchaseAmount.trim()} USDC` : "Not enabled"}
        />
        <SummaryRow
          label="Minimum tokens"
          value={
            minimumTokenAmountOut ? formatLaunchTokenAmount(BigInt(minimumTokenAmountOut)) : "N/A"
          }
        />
        <SummaryRow
          label="Factory"
          title={arcDeployment.factoryAddress}
          truncate
          value={formatWalletAddress(arcDeployment.factoryAddress)}
        />
        <SummaryRow label="Network" value={arcTestnet.name} />
        <SummaryRow label="Gas token" value={arcTestnet.nativeCurrency.symbol} />
        <SummaryRow label="Quote asset" value="Arc USDC" />
        <SummaryRow
          label="Metadata URI"
          value={
            maxMetadataUriLength === null
              ? `${metadataUriByteLength} bytes`
              : `${metadataUriByteLength} / ${maxMetadataUriLength} bytes`
          }
        />
        <SummaryRow label="Factory status" value={paused ? "Paused" : "Ready"} />
        <SummaryRow label="Launch path" value={purchaseMode} />
      </dl>
    </Card>
  );
}
