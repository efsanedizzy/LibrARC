import type { HTMLAttributes, ReactNode } from "react";

type SurfaceTone = "panel" | "card" | "muted";
type SurfacePadding = "sm" | "md" | "lg";

type SurfaceCardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  padding?: SurfacePadding;
  tone?: SurfaceTone;
};

const toneClassNames: Record<SurfaceTone, string> = {
  panel: "surface-panel",
  card: "surface-card",
  muted: "surface-muted"
};

const paddingClassNames: Record<SurfacePadding, string> = {
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-7"
};

export function SurfaceCard({
  children,
  className = "",
  padding = "md",
  tone = "panel",
  ...props
}: SurfaceCardProps) {
  return (
    <div
      {...props}
      className={[
        toneClassNames[tone],
        paddingClassNames[padding],
        "rounded-[var(--radius-lg)]",
        className
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
