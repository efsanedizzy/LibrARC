import type { ReactNode } from "react";

type LaunchFieldProps = {
  className?: string;
  children: ReactNode;
  error?: string;
  errorId?: string;
  hint?: string;
  hintClassName?: string;
  hintId?: string;
  htmlFor: string;
  label: string;
  labelNote?: string;
  required?: boolean;
};

export function LaunchField({
  className = "",
  children,
  error,
  errorId,
  hint,
  hintClassName = "",
  hintId,
  htmlFor,
  label,
  labelNote,
  required = false
}: LaunchFieldProps) {
  return (
    <div className={["flex h-full flex-col gap-2", className].filter(Boolean).join(" ")}>
      <label className="block text-sm font-semibold text-white" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-cyan-200">*</span> : null}
        {labelNote ? (
          <span className="ml-2 text-sm font-medium text-slate-400">{labelNote}</span>
        ) : null}
      </label>
      {hint ? (
        <p
          className={["text-sm leading-6 text-slate-400", hintClassName].filter(Boolean).join(" ")}
          id={hintId}
        >
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p className="text-sm leading-6 text-rose-200" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
