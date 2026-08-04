import type { ReactNode } from "react";

type LaunchSectionProps = {
  children: ReactNode;
  description?: string;
  eyebrow?: string;
  id: string;
  title: string;
};

export function LaunchSection({ children, description, eyebrow, id, title }: LaunchSectionProps) {
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className="space-y-1.5">
        {eyebrow ? (
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-cyan-100/70">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-[1.05rem] font-semibold text-white" id={id}>
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
