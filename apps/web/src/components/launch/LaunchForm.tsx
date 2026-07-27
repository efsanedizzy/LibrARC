"use client";

import Image from "next/image";
import { useEffect, useId, useState } from "react";
import { useConnection } from "wagmi";

import { arcTestnet } from "../../lib/chains/arc-testnet";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { LaunchField } from "./LaunchField";
import { LaunchProgress } from "./LaunchProgress";
import { LaunchReview } from "./LaunchReview";
import type { LaunchFieldName, LaunchFormErrors, LaunchFormValues, LaunchStep } from "./types";
import { launchSteps, stepFields } from "./types";
import {
  getAllErrors,
  getDisplayValue,
  getStepErrors,
  isStepValid,
  sanitizePurchaseInput,
  sanitizeSymbol
} from "./validation";

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
  initialPurchase: ""
};

function getFieldError(
  field: LaunchFieldName,
  touchedFields: Partial<Record<LaunchFieldName, boolean>>,
  errors: LaunchFormErrors
) {
  if (!touchedFields[field]) {
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

  const [currentStep, setCurrentStep] = useState<LaunchStep>(1);
  const [values, setValues] = useState<LaunchFormValues>(initialValues);
  const [touchedFields, setTouchedFields] = useState<Partial<Record<LaunchFieldName, boolean>>>({});
  const [finalMessage, setFinalMessage] = useState<string | null>(null);

  const connection = useConnection();
  const isConnected = connection.isConnected;
  const isWrongNetwork = isConnected && connection.chainId !== arcTestnet.id;

  const currentStepErrors = getStepErrors(currentStep, values);
  const allErrors = getAllErrors(values);
  const currentStepIsValid = isStepValid(currentStep, values);
  const reviewIsValid = Object.keys(allErrors).length === 0;
  const canLaunch = reviewIsValid && isConnected && !isWrongNetwork;
  const currentStepMeta = launchSteps.find((step) => step.id === currentStep) ?? launchSteps[0];

  useEffect(() => {
    return () => {
      if (values.logoPreviewUrl) {
        URL.revokeObjectURL(values.logoPreviewUrl);
      }
    };
  }, [values.logoPreviewUrl]);

  function markFieldsTouched(fields: LaunchFieldName[]) {
    setTouchedFields((current) => {
      const next = { ...current };

      for (const field of fields) {
        next[field] = true;
      }

      return next;
    });
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

  function handleContinue() {
    if (!currentStepIsValid || currentStep === 4) {
      markFieldsTouched(stepFields[currentStep]);
      return;
    }

    setCurrentStep((current) => (current < 4 ? ((current + 1) as LaunchStep) : current));
  }

  function handleBack() {
    setCurrentStep((current) => (current > 1 ? ((current - 1) as LaunchStep) : current));
  }

  function handleLaunch() {
    markFieldsTouched(stepFields[4]);

    if (!canLaunch) {
      return;
    }

    setFinalMessage(launchMessage);
  }

  const nameError = getFieldError("name", touchedFields, currentStepErrors);
  const symbolError = getFieldError("symbol", touchedFields, currentStepErrors);
  const descriptionError = getFieldError("description", touchedFields, currentStepErrors);
  const logoError = getFieldError("logo", touchedFields, currentStepErrors);
  const websiteError = getFieldError("website", touchedFields, currentStepErrors);
  const twitterError = getFieldError("twitter", touchedFields, currentStepErrors);
  const telegramError = getFieldError("telegram", touchedFields, currentStepErrors);
  const purchaseError = getFieldError("initialPurchase", touchedFields, currentStepErrors);

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-6">
        <LaunchProgress currentStep={currentStep} />

        <Card className="overflow-hidden p-0">
          <div className="border-b border-white/10 px-6 py-6 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100/70">
              Step {currentStep} of 4
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              {currentStepMeta.title}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
              {currentStepMeta.description}
            </p>
          </div>

          <div className="space-y-8 px-6 py-8 sm:px-8">
            {currentStep === 1 ? (
              <div className="grid gap-6">
                <LaunchField
                  error={nameError}
                  hint="Choose a token name between 2 and 32 characters. Leading and trailing spaces are ignored."
                  htmlFor={nameId}
                  label="Token name"
                  required
                >
                  <input
                    aria-describedby={nameError ? `${nameId}-error` : undefined}
                    aria-invalid={Boolean(nameError)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                    id={nameId}
                    maxLength={64}
                    onBlur={() => markFieldsTouched(["name"])}
                    onChange={(event) => handleTextChange("name", event.target.value)}
                    placeholder="Arc Nova"
                    type="text"
                    value={values.name}
                  />
                </LaunchField>

                <LaunchField
                  error={symbolError}
                  hint="Symbols are automatically uppercased and can only include A-Z and 0-9."
                  htmlFor={symbolId}
                  label="Token symbol"
                  required
                >
                  <input
                    aria-describedby={symbolError ? `${symbolId}-error` : undefined}
                    aria-invalid={Boolean(symbolError)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white uppercase outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                    id={symbolId}
                    maxLength={10}
                    onBlur={() => markFieldsTouched(["symbol"])}
                    onChange={(event) => handleTextChange("symbol", event.target.value)}
                    placeholder="ARCN"
                    spellCheck={false}
                    type="text"
                    value={values.symbol}
                  />
                </LaunchField>

                <LaunchField
                  error={descriptionError}
                  hint="Describe the project in 20 to 500 characters. The summary uses plain text only."
                  htmlFor={descriptionId}
                  label="Description"
                  required
                >
                  <textarea
                    aria-describedby={descriptionError ? `${descriptionId}-error` : undefined}
                    aria-invalid={Boolean(descriptionError)}
                    className="min-h-40 w-full rounded-[1.5rem] border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                    id={descriptionId}
                    maxLength={500}
                    onBlur={() => markFieldsTouched(["description"])}
                    onChange={(event) => handleTextChange("description", event.target.value)}
                    placeholder="Tell traders what the token does, why it exists, and what makes the launch worth watching."
                    value={values.description}
                  />
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                    {getDisplayValue(values.description).length} / 500
                  </p>
                </LaunchField>
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="grid gap-8">
                <LaunchField
                  error={logoError}
                  hint="PNG, JPEG, or WebP only. Maximum file size: 2 MB."
                  htmlFor={logoId}
                  label="Logo"
                  required
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_11rem]">
                    <label
                      className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-white/15 bg-slate-950/70 px-6 py-6 text-center transition hover:border-cyan-300/40 hover:bg-white/5"
                      htmlFor={logoId}
                    >
                      <span className="text-sm font-semibold text-white">Choose logo image</span>
                      <span className="mt-2 text-sm leading-6 text-slate-400">
                        Select a local file for preview only. Nothing is uploaded yet.
                      </span>
                    </label>

                    <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/80">
                      {values.logoPreviewUrl ? (
                        <Image
                          alt={`${getDisplayValue(values.name) || "Token"} logo preview`}
                          className="h-full w-full object-cover"
                          height={176}
                          src={values.logoPreviewUrl}
                          unoptimized
                          width={176}
                        />
                      ) : (
                        <span className="px-6 text-center text-xs uppercase tracking-[0.24em] text-slate-500">
                          Preview
                        </span>
                      )}
                    </div>
                  </div>

                  <input
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    id={logoId}
                    onBlur={() => markFieldsTouched(["logo"])}
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

                <div className="grid gap-6">
                  <LaunchField
                    error={websiteError}
                    hint="Optional. Use an HTTPS URL for the project website."
                    htmlFor={websiteId}
                    label="Website"
                  >
                    <input
                      aria-describedby={websiteError ? `${websiteId}-error` : undefined}
                      aria-invalid={Boolean(websiteError)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                      id={websiteId}
                      onBlur={() => markFieldsTouched(["website"])}
                      onChange={(event) => handleTextChange("website", event.target.value)}
                      placeholder="https://project.xyz"
                      type="url"
                      value={values.website}
                    />
                  </LaunchField>

                  <LaunchField
                    error={twitterError}
                    hint="Optional. Accepts valid https://x.com/... or https://twitter.com/... profile URLs."
                    htmlFor={twitterId}
                    label="X / Twitter"
                  >
                    <input
                      aria-describedby={twitterError ? `${twitterId}-error` : undefined}
                      aria-invalid={Boolean(twitterError)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                      id={twitterId}
                      onBlur={() => markFieldsTouched(["twitter"])}
                      onChange={(event) => handleTextChange("twitter", event.target.value)}
                      placeholder="https://x.com/arcproject"
                      type="url"
                      value={values.twitter}
                    />
                  </LaunchField>

                  <LaunchField
                    error={telegramError}
                    hint="Optional. Accepts valid https://t.me/... or https://telegram.me/... URLs."
                    htmlFor={telegramId}
                    label="Telegram"
                  >
                    <input
                      aria-describedby={telegramError ? `${telegramId}-error` : undefined}
                      aria-invalid={Boolean(telegramError)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                      id={telegramId}
                      onBlur={() => markFieldsTouched(["telegram"])}
                      onChange={(event) => handleTextChange("telegram", event.target.value)}
                      placeholder="https://t.me/arcproject"
                      type="url"
                      value={values.telegram}
                    />
                  </LaunchField>
                </div>
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="grid gap-6">
                <LaunchField
                  error={purchaseError}
                  hint="Optional. This is a display-only USDC amount for now. No purchase transaction is sent."
                  htmlFor={purchaseId}
                  label="Initial creator purchase"
                >
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-cyan-100/80">
                      USDC
                    </span>
                    <input
                      aria-describedby={purchaseError ? `${purchaseId}-error` : undefined}
                      aria-invalid={Boolean(purchaseError)}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-18 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50"
                      id={purchaseId}
                      inputMode="decimal"
                      onBlur={() => markFieldsTouched(["initialPurchase"])}
                      onChange={(event) => handleTextChange("initialPurchase", event.target.value)}
                      placeholder="0.00"
                      type="text"
                      value={values.initialPurchase}
                    />
                  </div>
                </LaunchField>

                <Card className="rounded-[1.5rem] border-white/10 bg-white/4 p-5">
                  <p className="text-sm font-semibold text-white">Purchase preview</p>
                  <p className="mt-3 text-sm leading-7 text-slate-400">
                    The launch flow stores this amount only in component state for review. Contract
                    calls and onchain purchases will be wired later.
                  </p>
                  <p className="mt-5 text-2xl font-semibold tracking-tight text-white">
                    {getDisplayValue(values.initialPurchase)
                      ? `${getDisplayValue(values.initialPurchase)} USDC`
                      : "No initial purchase set"}
                  </p>
                </Card>
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="space-y-6">
                <LaunchReview values={values} />

                <Card className="space-y-4 rounded-[1.5rem] border-white/10 bg-white/4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">Wallet requirement</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400">
                        Connect an injected wallet and switch to Arc Testnet before the launch
                        action becomes available.
                      </p>
                    </div>
                    <WalletConnectButton />
                  </div>

                  <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/70 p-4">
                    <p className="text-sm text-slate-400">Connection status</p>
                    <p className="mt-2 text-base font-semibold text-white">
                      {!isConnected
                        ? "Wallet not connected"
                        : isWrongNetwork
                          ? `Connected to ${connection.chain?.name ?? "the wrong network"}`
                          : `Connected to ${connection.chain?.name ?? arcTestnet.name}`}
                    </p>
                    {isWrongNetwork ? (
                      <p className="mt-2 text-sm leading-6 text-amber-100">
                        Use the wallet control to switch to Arc Testnet before launching.
                      </p>
                    ) : null}
                  </div>
                </Card>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <Button disabled={currentStep === 1} onClick={handleBack} variant="ghost">
              Back
            </Button>

            <div className="flex flex-col gap-3 sm:flex-row">
              {currentStep < 4 ? (
                <Button disabled={!currentStepIsValid} onClick={handleContinue}>
                  Continue
                </Button>
              ) : (
                <Button disabled={!canLaunch} onClick={handleLaunch}>
                  Launch Token
                </Button>
              )}
            </div>
          </div>
        </Card>

        {finalMessage ? (
          <p className="rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/10 px-5 py-4 text-sm leading-6 text-cyan-100">
            {finalMessage}
          </p>
        ) : null}
      </div>

      <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <Card className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
            Launch checklist
          </p>
          <ul className="space-y-3 text-sm leading-6 text-slate-300">
            <li>Provide a valid token identity and a plain-text project description.</li>
            <li>Add a local logo preview without uploading anything yet.</li>
            <li>Review optional links and the initial USDC purchase amount.</li>
            <li>Connect a wallet on Arc Testnet before the final launch action.</li>
          </ul>
        </Card>

        <Card className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/70">
            Snapshot
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1.25rem] border border-white/10 bg-slate-950/80">
                {values.logoPreviewUrl ? (
                  <Image
                    alt={`${getDisplayValue(values.name) || "Token"} logo snapshot`}
                    className="h-full w-full object-cover"
                    height={64}
                    src={values.logoPreviewUrl}
                    unoptimized
                    width={64}
                  />
                ) : (
                  <span className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                    Logo
                  </span>
                )}
              </div>
              <div>
                <p className="text-lg font-semibold text-white">
                  {getDisplayValue(values.name) || "Unnamed token"}
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  {values.symbol ? `$${values.symbol}` : "Symbol pending"}
                </p>
              </div>
            </div>

            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Description</dt>
                <dd className="text-white">{getDisplayValue(values.description).length} chars</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Links added</dt>
                <dd className="text-white">
                  {
                    [values.website, values.twitter, values.telegram].filter((value) =>
                      getDisplayValue(value)
                    ).length
                  }
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-400">Purchase</dt>
                <dd className="text-white">
                  {getDisplayValue(values.initialPurchase)
                    ? `${getDisplayValue(values.initialPurchase)} USDC`
                    : "Not set"}
                </dd>
              </div>
            </dl>
          </div>
        </Card>
      </aside>
    </div>
  );
}
