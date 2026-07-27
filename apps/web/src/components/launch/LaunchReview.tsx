import Image from "next/image";

import { Card } from "../ui/Card";
import type { LaunchFormValues } from "./types";
import { getDisplayValue } from "./validation";

type LaunchReviewProps = {
  values: LaunchFormValues;
};

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/8 pb-4 last:border-b-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <dt className="text-sm font-medium text-slate-400">{label}</dt>
      <dd className="max-w-xl text-sm leading-6 text-white">{value}</dd>
    </div>
  );
}

export function LaunchReview({ values }: LaunchReviewProps) {
  const trimmedName = getDisplayValue(values.name);
  const trimmedDescription = getDisplayValue(values.description);
  const trimmedWebsite = getDisplayValue(values.website);
  const trimmedTwitter = getDisplayValue(values.twitter);
  const trimmedTelegram = getDisplayValue(values.telegram);
  const trimmedInitialPurchase = getDisplayValue(values.initialPurchase);

  return (
    <Card className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-900">
          {values.logoPreviewUrl ? (
            <Image
              alt={`${trimmedName || "Token"} logo preview`}
              className="h-full w-full object-cover"
              height={96}
              src={values.logoPreviewUrl}
              unoptimized
              width={96}
            />
          ) : (
            <span className="text-xs uppercase tracking-[0.24em] text-slate-500">No Logo</span>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
            Launch summary
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">{trimmedName}</h3>
          <p className="mt-1 text-sm text-slate-400">${values.symbol}</p>
        </div>
      </div>

      <dl className="space-y-4">
        <ReviewRow label="Description" value={trimmedDescription} />
        <ReviewRow label="Website" value={trimmedWebsite || "No website provided"} />
        <ReviewRow
          label="X / Twitter"
          value={trimmedTwitter || "No X / Twitter profile provided"}
        />
        <ReviewRow label="Telegram" value={trimmedTelegram || "No Telegram link provided"} />
        <ReviewRow
          label="Initial creator purchase"
          value={
            trimmedInitialPurchase ? `${trimmedInitialPurchase} USDC` : "No initial purchase set"
          }
        />
      </dl>
    </Card>
  );
}
