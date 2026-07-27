"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useConnection } from "wagmi";

import { arcTestnet } from "../../lib/chains/arc-testnet";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { LaunchField } from "./LaunchField";
import { LaunchSummary } from "./LaunchSummary";
import type { LaunchFieldName, LaunchFormErrors, LaunchFormValues } from "./types";
import { getAllErrors, getDisplayValue, sanitizePurchaseInput, sanitizeSymbol } from "./validation";

const launchMessage = "Token deployment will be enabled after the smart contracts are integrated.";

const initialValues: LaunchFormValues = {
  name: "",
  symbol: "",
  description: "",
  logoFile: null,
  logoPreviewUrl: null,
  website: "",
  twitter: "",
  telegram: "",
  initialPurchase: "",
  creatorWallet: ""
};

function getFieldError(
  field: LaunchFieldName,
  touchedFields: Partial<Record<LaunchFieldName, boolean>>,
  errors: LaunchFormErrors,
  hasSubmitted: boolean
) {
  if (!touchedFields[field] && !hasSubmitted) {
    return undefined;
  }

  return errors[field];
}

export function LaunchForm() {
  const nameId = useId();
  const symbolId = useId();
  const descriptionId = useId();
  const logoId = useId();
  const websiteId = useId();
  const twitterId = useId();
  const telegramId = useId();
  const purchaseId = useId();
  const creatorWalletId = useId();

  const [values, setValues] = useState<LaunchFormValues>(initialValues);
  const [touchedFields, setTouchedFields] = useState<Partial<Record<LaunchFieldName, boolean>>>({});
  const [finalMessage, setFinalMessage] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const connection = useConnection();
  const isConnected = connection.isConnected;
  const isWrongNetwork = isConnected && connection.chainId !== arcTestnet.id;

  const allErrors = getAllErrors(values);
  const hasValidationErrors = Object.keys(allErrors).length > 0;
  const canLaunch = !hasValidationErrors && isConnected && !isWrongNetwork;

  useEffect(() => {
    return () => {
      if (values.logoPreviewUrl) {
        URL.revokeObjectURL(values.logoPreviewUrl);
      }
    };
  }, [values.logoPreviewUrl]);

  function markFieldTouched(field: LaunchFieldName) {
    setTouchedFields((current) => ({
      ...current,
      [field]: true
    }));
  }

  function handleTextChange(field: Exclude<LaunchFieldName, "logo">, nextValue: string) {
    setValues((current) => ({
      ...current,
      [field]:
        field === "symbol"
          ? sanitizeSymbol(nextValue)
          : field === "initialPurchase"
            ? sanitizePurchaseInput(nextValue)
            : nextValue
    }));
    setFinalMessage(null);
  }

  function handleLogoChange(file: File | null) {
    setValues((current) => {
      if (current.logoPreviewUrl) {
        URL.revokeObjectURL(current.logoPreviewUrl);
      }

      if (!file) {
        return {
          ...current,
          logoFile: null,
          logoPreviewUrl: null
        };
      }

      const nextPreviewUrl = URL.createObjectURL(file);

      return {
        ...current,
        logoFile: file,
        logoPreviewUrl: nextPreviewUrl
      };
    });

    setTouchedFields((current) => ({
      ...current,
      logo: true
    }));
    setFinalMessage(null);
  }

  function handleLaunch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasSubmitted(true);

    if (!canLaunch) {
      return;
    }

    setFinalMessage(launchMessage);
  }

  const nameError = getFieldError("name", touchedFields, allErrors, hasSubmitted);
  const symbolError = getFieldError("symbol", touchedFields, allErrors, hasSubmitted);
  const descriptionError = getFieldError("description", touchedFields, allErrors, hasSubmitted);
  const logoError = getFieldError("logo", touchedFields, allErrors, hasSubmitted);
  const websiteError = getFieldError("website", touchedFields, allErrors, hasSubmitted);
  const twitterError = getFieldError("twitter", touchedFields, allErrors, hasSubmitted);
  const telegramError = getFieldError("telegram", touchedFields, allErrors, hasSubmitted);
  const purchaseError = getFieldError("initialPurchase", touchedFields, allErrors, hasSubmitted);
  const creatorWalletError = getFieldError("creatorWallet", touchedFields, allErrors, hasSubmitted);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
      <form className="space-y-6" noValidate onSubmit={handleLaunch}>
        <Card className="space-y-8">
          <div className="space-y-3">
            <Link
              className="inline-flex items-center gap-2 rounded-full text-sm font-semibold text-cyan-200 transition hover:text-cyan-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              href="/"
            >
              <span aria-hidden="true">←</span>
              Back to home
            </Link>
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Launch a token
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
                Set your token details, add a logo and optional links, then review the live Arc
                Testnet launch summary before deployment is enabled.
              </p>
            </div>
          </div>

          <section aria-labelledby="token-details-heading" className="space-y-6">
            <div>
              <h2
                className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70"
                id="token-details-heading"
              >
                Token details
              </h2>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <LaunchField
                className="h-full"
                error={nameError}
                errorId={`${nameId}-error`}
                hint="Required. Trimmed length must be between 2 and 32 characters."
                hintClassName="min-h-12"
                hintId={`${nameId}-hint`}
                htmlFor={nameId}
                label="Token name"
                required
              >
                <input
                  aria-describedby={[`${nameId}-hint`, nameError ? `${nameId}-error` : ""]
                    .filter(Boolean)
                    .join(" ")}
                  aria-invalid={Boolean(nameError)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                  id={nameId}
                  maxLength={64}
                  onBlur={() => markFieldTouched("name")}
                  onChange={(event) => handleTextChange("name", event.target.value)}
                  placeholder="Arc Nova"
                  type="text"
                  value={values.name}
                />
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  {getDisplayValue(values.name).length} / 32
                </p>
              </LaunchField>

              <LaunchField
                className="h-full"
                error={symbolError}
                errorId={`${symbolId}-error`}
                hint="Required. Automatically uppercased. A-Z and 0-9 only."
                hintClassName="min-h-12"
                hintId={`${symbolId}-hint`}
                htmlFor={symbolId}
                label="Token symbol"
                required
              >
                <input
                  aria-describedby={[`${symbolId}-hint`, symbolError ? `${symbolId}-error` : ""]
                    .filter(Boolean)
                    .join(" ")}
                  aria-invalid={Boolean(symbolError)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white uppercase outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                  id={symbolId}
                  maxLength={10}
                  onBlur={() => markFieldTouched("symbol")}
                  onChange={(event) => handleTextChange("symbol", event.target.value)}
                  placeholder="ARCN"
                  spellCheck={false}
                  type="text"
                  value={values.symbol}
                />
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                  {values.symbol.length} / 10
                </p>
              </LaunchField>
            </div>

            <LaunchField
              error={descriptionError}
              errorId={`${descriptionId}-error`}
              hint="Optional. When provided, leading and trailing whitespace are trimmed and the description must be 500 characters or fewer."
              hintId={`${descriptionId}-hint`}
              htmlFor={descriptionId}
              label="Description"
              labelNote="(optional)"
            >
              <textarea
                aria-describedby={[
                  `${descriptionId}-hint`,
                  descriptionError ? `${descriptionId}-error` : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-invalid={Boolean(descriptionError)}
                className="min-h-40 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                id={descriptionId}
                maxLength={500}
                onBlur={() => markFieldTouched("description")}
                onChange={(event) => handleTextChange("description", event.target.value)}
                placeholder="Tell traders what the token does, why it exists, and why this launch matters."
                value={values.description}
              />
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                {getDisplayValue(values.description).length} / 500
              </p>
            </LaunchField>
          </section>

          <section aria-labelledby="media-links-heading" className="space-y-6">
            <div>
              <h2
                className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70"
                id="media-links-heading"
              >
                Media and links
              </h2>
            </div>

            <div className="grid gap-6">
              <LaunchField
                error={logoError}
                errorId={`${logoId}-error`}
                hint="Required. PNG, JPEG, or WebP only. Maximum file size: 2 MB."
                hintId={`${logoId}-hint`}
                htmlFor={logoId}
                label="Token logo"
                required
              >
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_9rem]">
                  <label
                    className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/15 bg-slate-950/70 px-6 py-6 text-center transition hover:border-cyan-300/40 hover:bg-white/5"
                    htmlFor={logoId}
                  >
                    <span className="text-sm font-semibold text-white">Choose logo image</span>
                    <span className="mt-2 text-sm leading-6 text-slate-400">
                      Preview locally only. No upload happens yet.
                    </span>
                  </label>

                  <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/80">
                    {values.logoPreviewUrl ? (
                      <Image
                        alt={`${getDisplayValue(values.name) || "Token"} logo preview`}
                        className="h-full w-full object-cover"
                        height={144}
                        src={values.logoPreviewUrl}
                        unoptimized
                        width={144}
                      />
                    ) : (
                      <span className="px-4 text-center text-[10px] uppercase tracking-[0.24em] text-slate-500">
                        Preview
                      </span>
                    )}
                  </div>
                </div>

                <input
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  id={logoId}
                  onBlur={() => markFieldTouched("logo")}
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;

                    handleLogoChange(nextFile);
                  }}
                  type="file"
                />

                {values.logoFile ? (
                  <p className="text-sm leading-6 text-slate-400">
                    Selected file: {values.logoFile.name}
                  </p>
                ) : null}
              </LaunchField>

              <div className="grid gap-6 md:grid-cols-2">
                <LaunchField
                  error={websiteError}
                  errorId={`${websiteId}-error`}
                  hint="Optional. HTTPS URLs only."
                  hintId={`${websiteId}-hint`}
                  htmlFor={websiteId}
                  label="Website"
                >
                  <input
                    aria-describedby={[
                      `${websiteId}-hint`,
                      websiteError ? `${websiteId}-error` : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-invalid={Boolean(websiteError)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                    id={websiteId}
                    onBlur={() => markFieldTouched("website")}
                    onChange={(event) => handleTextChange("website", event.target.value)}
                    placeholder="https://project.xyz"
                    type="url"
                    value={values.website}
                  />
                </LaunchField>

                <LaunchField
                  error={twitterError}
                  errorId={`${twitterId}-error`}
                  hint="Optional. Valid x.com or twitter.com profile URL only."
                  hintId={`${twitterId}-hint`}
                  htmlFor={twitterId}
                  label="X / Twitter"
                >
                  <input
                    aria-describedby={[
                      `${twitterId}-hint`,
                      twitterError ? `${twitterId}-error` : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-invalid={Boolean(twitterError)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                    id={twitterId}
                    onBlur={() => markFieldTouched("twitter")}
                    onChange={(event) => handleTextChange("twitter", event.target.value)}
                    placeholder="https://x.com/arcproject"
                    type="url"
                    value={values.twitter}
                  />
                </LaunchField>
              </div>

              <LaunchField
                error={telegramError}
                errorId={`${telegramId}-error`}
                hint="Optional. Valid t.me or telegram.me URL only."
                hintId={`${telegramId}-hint`}
                htmlFor={telegramId}
                label="Telegram"
              >
                <input
                  aria-describedby={[
                    `${telegramId}-hint`,
                    telegramError ? `${telegramId}-error` : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-invalid={Boolean(telegramError)}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                  id={telegramId}
                  onBlur={() => markFieldTouched("telegram")}
                  onChange={(event) => handleTextChange("telegram", event.target.value)}
                  placeholder="https://t.me/arcproject"
                  type="url"
                  value={values.telegram}
                />
              </LaunchField>
            </div>
          </section>

          <section aria-labelledby="purchase-heading" className="space-y-6">
            <div>
              <h2
                className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70"
                id="purchase-heading"
              >
                Initial purchase
              </h2>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.42fr)]">
              <LaunchField
                error={purchaseError}
                errorId={`${purchaseId}-error`}
                hint="Optional. Displayed in USDC only. No transaction logic is wired yet."
                hintId={`${purchaseId}-hint`}
                htmlFor={purchaseId}
                label="Initial creator purchase in USDC"
              >
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-cyan-100/80">
                    USDC
                  </span>
                  <input
                    aria-describedby={[
                      `${purchaseId}-hint`,
                      purchaseError ? `${purchaseId}-error` : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-invalid={Boolean(purchaseError)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 py-3 pl-18 pr-4 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                    id={purchaseId}
                    inputMode="decimal"
                    onBlur={() => markFieldTouched("initialPurchase")}
                    onChange={(event) => handleTextChange("initialPurchase", event.target.value)}
                    placeholder="0.00"
                    type="text"
                    value={values.initialPurchase}
                  />
                </div>
              </LaunchField>

              <Card className="rounded-[1.5rem] border-white/10 bg-white/4 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
                  Display preview
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-400">
                  This amount stays in local component state and appears in the launch summary.
                </p>
                <p className="mt-5 text-2xl font-semibold tracking-tight text-white">
                  {getDisplayValue(values.initialPurchase)
                    ? `${getDisplayValue(values.initialPurchase)} USDC`
                    : "Not set"}
                </p>
              </Card>
            </div>
          </section>

          <section aria-labelledby="advanced-options-heading" className="space-y-4">
            <details className="rounded-[1.5rem] border border-white/10 bg-white/4 px-5 py-4">
              <summary
                className="cursor-pointer list-none text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/80 outline-none marker:hidden"
                id="advanced-options-heading"
              >
                Advanced options
              </summary>
              <div className="mt-5 space-y-5">
                <LaunchField
                  error={creatorWalletError}
                  errorId={`${creatorWalletId}-error`}
                  hint="Leave empty to use the connected wallet. When provided, it must be a valid EVM address."
                  hintId={`${creatorWalletId}-hint`}
                  htmlFor={creatorWalletId}
                  label="Creator wallet address"
                >
                  <input
                    aria-describedby={[
                      `${creatorWalletId}-hint`,
                      creatorWalletError ? `${creatorWalletId}-error` : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    aria-invalid={Boolean(creatorWalletError)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 font-mono text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                    id={creatorWalletId}
                    onBlur={() => markFieldTouched("creatorWallet")}
                    onChange={(event) => handleTextChange("creatorWallet", event.target.value)}
                    placeholder="0x1234...abcd"
                    spellCheck={false}
                    type="text"
                    value={values.creatorWallet}
                  />
                </LaunchField>
              </div>
            </details>
          </section>

          <section
            aria-labelledby="launch-action-heading"
            className="space-y-4 border-t border-white/10 pt-8"
          >
            <div>
              <h2
                className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100/70"
                id="launch-action-heading"
              >
                Final action
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-400">
                Connect an injected wallet on Arc Testnet to enable the launch action. No contract
                deployment, signature, or transaction is sent yet.
              </p>
            </div>
            <Card className="space-y-4 rounded-[1.5rem] border-white/10 bg-white/4">
              <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/70 p-4">
                <p className="text-sm text-slate-400">Connection status</p>
                <p className="mt-2 text-base font-semibold text-white">
                  {!isConnected
                    ? "Wallet not connected"
                    : isWrongNetwork
                      ? `Connected to ${connection.chain?.name ?? "the wrong network"}`
                      : `Connected to ${connection.chain?.name ?? arcTestnet.name}`}
                </p>
                {!isConnected ? (
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Connect a browser wallet to continue.
                  </p>
                ) : null}
                {isWrongNetwork ? (
                  <p className="mt-2 text-sm leading-6 text-amber-100">
                    Use the wallet control below to switch to Arc Testnet before launching.
                  </p>
                ) : null}
              </div>

              {!isConnected || isWrongNetwork ? (
                <div className="flex justify-start">
                  <WalletConnectButton />
                </div>
              ) : (
                <Button disabled={!canLaunch} type="submit">
                  Launch Token
                </Button>
              )}

              {hasSubmitted && hasValidationErrors ? (
                <p className="rounded-[1.25rem] border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm leading-6 text-rose-100">
                  Fix the validation errors in the form before launching.
                </p>
              ) : null}
            </Card>
          </section>
        </Card>

        {finalMessage ? (
          <p className="rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/10 px-5 py-4 text-sm leading-6 text-cyan-100">
            {finalMessage}
          </p>
        ) : null}
      </form>

      <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <LaunchSummary connectedWalletAddress={connection.address} values={values} />
      </aside>
    </div>
  );
}
