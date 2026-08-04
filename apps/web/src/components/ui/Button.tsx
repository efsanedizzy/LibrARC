import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type CommonButtonProps = {
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

type LinkButtonProps = CommonButtonProps & {
  href: string;
  rel?: AnchorHTMLAttributes<HTMLAnchorElement>["rel"];
  target?: AnchorHTMLAttributes<HTMLAnchorElement>["target"];
};

type NativeButtonProps = CommonButtonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    href?: never;
  };

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-white hover:bg-[var(--accent-strong)] focus-visible:outline-[var(--accent-strong)]",
  secondary:
    "border border-[var(--border-soft)] bg-[var(--bg-elevated)] text-white hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-strong)] focus-visible:outline-[var(--accent-strong)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--text-secondary)] hover:border-[var(--border-soft)] hover:bg-[var(--bg-surface)] hover:text-white focus-visible:outline-[var(--accent-strong)]"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3.5 text-sm",
  md: "min-h-10 px-4.5 text-sm sm:text-[0.95rem]",
  lg: "min-h-11 px-5 text-base"
};

function getButtonClassName({
  className = "",
  fullWidth = false,
  size = "md",
  variant = "primary"
}: CommonButtonProps) {
  return [
    "inline-flex items-center justify-center gap-2 rounded-[0.9rem] font-semibold tracking-tight transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:border-[var(--border-soft)] disabled:bg-[var(--bg-surface)] disabled:text-[var(--text-faint)]",
    variantClasses[variant],
    sizeClasses[size],
    fullWidth ? "w-full" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");
}

function isLinkButtonProps(props: LinkButtonProps | NativeButtonProps): props is LinkButtonProps {
  return typeof props.href === "string";
}

export function Button(props: LinkButtonProps | NativeButtonProps) {
  if (isLinkButtonProps(props)) {
    const {
      children,
      className: customClassName,
      fullWidth,
      href,
      rel,
      size,
      target,
      variant
    } = props;
    const className = getButtonClassName({
      children,
      className: customClassName,
      fullWidth,
      size,
      variant
    });

    return (
      <Link className={className} href={href} rel={rel} target={target}>
        {children}
      </Link>
    );
  }

  const {
    children,
    className: customClassName,
    fullWidth,
    size,
    type = "button",
    variant,
    ...buttonProps
  } = props;
  const className = getButtonClassName({
    children,
    className: customClassName,
    fullWidth,
    size,
    variant
  });

  return (
    <button {...buttonProps} className={className} type={type}>
      {children}
    </button>
  );
}
