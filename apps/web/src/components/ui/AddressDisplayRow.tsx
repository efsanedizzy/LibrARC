"use client";

import Link from "next/link";

import { formatCompactAddress } from "../../lib/arc/format";

type AddressDisplayRowProps = {
  copyAriaLabel?: string;
  copyButtonLabel?: string;
  href?: string;
  label: string;
  onCopy?: () => void;
  value?: string;
};

export function AddressDisplayRow({
  copyAriaLabel,
  copyButtonLabel = "Copy",
  href,
  label,
  onCopy,
  value
}: AddressDisplayRowProps) {
  const hasValue = Boolean(value);
  const hasCopy = hasValue && typeof onCopy === "function";
  const compactAddress = hasValue ? formatCompactAddress(value as `0x${string}`) : "Not available";

  return (
    <div className="rounded-[var(--radius-md)] border border-white/8 bg-white/[0.035] px-4 py-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-faint)]">
            {label}
          </p>
          {hasCopy ? (
            <button
              aria-label={copyAriaLabel ?? `Copy ${label.toLowerCase()} address`}
              className="mt-2 block max-w-full truncate font-mono text-left text-sm text-white transition hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
              onClick={onCopy}
              title={value ?? "Not available"}
              type="button"
            >
              {compactAddress}
            </button>
          ) : (
            <p
              className="mt-2 truncate font-mono text-sm text-white"
              title={value ?? "Not available"}
            >
              {compactAddress}
            </p>
          )}
        </div>
        {hasCopy ? (
          <button
            className="rounded-[0.75rem] border border-[var(--border-soft)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)] transition hover:text-white"
            onClick={onCopy}
            type="button"
          >
            {copyButtonLabel}
          </button>
        ) : null}
      </div>

      {hasValue && href ? (
        <Link
          className="mt-3 inline-flex text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200 transition hover:text-white"
          href={href}
          rel="noreferrer"
          target="_blank"
        >
          View on explorer
        </Link>
      ) : null}
    </div>
  );
}
