type StatPillProps = {
  className?: string;
  label: string;
  tone?: "default" | "accent";
  value: string;
};

export function StatPill({ className = "", label, tone = "default", value }: StatPillProps) {
  return (
    <div
      className={[
        "rounded-[var(--radius-md)] border px-4 py-3",
        tone === "accent"
          ? "border-[var(--border-strong)] bg-[rgba(50,108,255,0.12)]"
          : "border-[var(--border-soft)] bg-[rgba(255,255,255,0.02)]",
        className
      ].join(" ")}
    >
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--text-faint)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-white sm:text-[0.98rem]">{value}</p>
    </div>
  );
}
