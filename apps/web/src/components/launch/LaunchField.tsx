import type { ReactNode } from "react";

type LaunchFieldProps = {
  children: ReactNode;
  error?: string;
  hint?: string;
  htmlFor: string;
  label: string;
  required?: boolean;
};

export function LaunchField({
  children,
  error,
  hint,
  htmlFor,
  label,
  required = false
}: LaunchFieldProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-white" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-cyan-200">*</span> : null}
      </label>
      {hint ? <p className="text-sm leading-6 text-slate-400">{hint}</p> : null}
      {children}
      {error ? <p className="text-sm leading-6 text-rose-200">{error}</p> : null}
    </div>
  );
}
