import type { LaunchStep } from "./types";
import { launchSteps } from "./types";

type LaunchProgressProps = {
  currentStep: LaunchStep;
};

export function LaunchProgress({ currentStep }: LaunchProgressProps) {
  return (
    <nav aria-label="Launch progress">
      <ol className="grid gap-3 md:grid-cols-4">
        {launchSteps.map((step) => {
          const isCurrent = step.id === currentStep;
          const isComplete = step.id < currentStep;

          return (
            <li key={step.id}>
              <div
                aria-current={isCurrent ? "step" : undefined}
                className={[
                  "rounded-[1.5rem] border p-4 transition",
                  isCurrent
                    ? "border-cyan-300/40 bg-cyan-300/10"
                    : isComplete
                      ? "border-emerald-300/30 bg-emerald-300/10"
                      : "border-white/10 bg-white/4"
                ].join(" ")}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={[
                      "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold",
                      isCurrent
                        ? "bg-cyan-300 text-slate-950"
                        : isComplete
                          ? "bg-emerald-300 text-slate-950"
                          : "border border-white/10 bg-slate-900 text-slate-300"
                    ].join(" ")}
                  >
                    {step.id}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                      {isComplete ? "Complete" : isCurrent ? "Current" : "Upcoming"}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
