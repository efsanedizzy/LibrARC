import type { ReactNode } from "react";

type SectionHeadingProps = {
  action?: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  title: string;
};

export function SectionHeading({
  action,
  className = "",
  description,
  eyebrow,
  title
}: SectionHeadingProps) {
  return (
    <div
      className={[
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
      ].join(" ")}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-[2rem]">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)] sm:text-[0.98rem]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
