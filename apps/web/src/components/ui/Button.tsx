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
    "bg-cyan-300 text-slate-950 shadow-[0_18px_48px_rgba(34,211,238,0.24)] hover:bg-cyan-200 focus-visible:outline-cyan-200",
  secondary:
    "border border-white/12 bg-white/8 text-white hover:border-cyan-300/50 hover:bg-white/12 focus-visible:outline-cyan-300",
  ghost:
    "border border-transparent bg-transparent text-slate-200 hover:border-white/10 hover:bg-white/8 hover:text-white focus-visible:outline-cyan-300"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-10 px-4 text-sm",
  md: "min-h-11 px-5 text-sm sm:text-base",
  lg: "min-h-12 px-6 text-base"
};

function getButtonClassName({
  className = "",
  fullWidth = false,
  size = "md",
  variant = "primary"
}: CommonButtonProps) {
  return [
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/6 disabled:text-slate-500",
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
