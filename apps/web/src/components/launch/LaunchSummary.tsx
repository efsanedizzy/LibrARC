import Image from "next/image";
import type { Address } from "viem";

import { arcTestnet } from "../../lib/chains/arc-testnet";
import { Card } from "../ui/Card";
import type { LaunchFormValues } from "./types";
import { getDisplayValue } from "./validation";

type LaunchSummaryProps = {
  connectedWalletAddress?: Address;
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

export function LaunchSummary({ connectedWalletAddress, values }: LaunchSummaryProps) {
  const tokenName = getDisplayValue(values.name) || "Unnamed token";
  const tokenSymbol = values.symbol || "SYMBOL";
  const description = getDisplayValue(values.description) || "No description provided";
  const initialPurchase = getDisplayValue(values.initialPurchase)
    ? `${getDisplayValue(values.initialPurchase)} USDC`
    : "Not set";
  const creatorWalletValue = getDisplayValue(values.creatorWallet)
    ? getDisplayValue(values.creatorWallet)
    : connectedWalletAddress
      ? connectedWalletAddress
      : "Connected wallet will be used";
  const isWalletAddress = creatorWalletValue.startsWith("0x");
  const creatorWallet = isWalletAddress
    ? formatWalletAddress(creatorWalletValue)
    : creatorWalletValue;

  return (
    <Card className="space-y-6">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-18 w-18 items-center justify-center overflow-hidden rounded-[1.4rem] border border-white/10 bg-slate-950/80">
          {values.logoPreviewUrl ? (
            <Image
              alt={`${tokenName} logo preview`}
              className="h-full w-full object-cover"
              height={72}
              src={values.logoPreviewUrl}
              unoptimized
              width={72}
            />
          ) : (
            <span className="px-3 text-center text-[10px] uppercase tracking-[0.24em] text-slate-500">
              Logo
            </span>
          )}
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
        <SummaryRow label="Initial purchase" value={initialPurchase} />
        <SummaryRow
          label="Creator wallet"
          title={isWalletAddress ? creatorWalletValue : undefined}
          truncate={isWalletAddress}
          value={creatorWallet}
        />
        <SummaryRow label="Network" value={arcTestnet.name} />
        <SummaryRow label="Gas token" value={arcTestnet.nativeCurrency.symbol} />
        <SummaryRow label="Graduation" value="Configuration pending" />
        <SummaryRow label="Liquidity" value="Locked after graduation" />
        <SummaryRow label="Launch fee" value="Configuration pending" />
      </dl>
    </Card>
  );
}
