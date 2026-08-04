import type { KeyboardEvent } from "react";

type SegmentedOption<T extends string> = {
  label: string;
  value: T;
};

type SegmentedControlProps<T extends string> = {
  ariaLabel: string;
  className?: string;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  value: T;
};

export function SegmentedControl<T extends string>({
  ariaLabel,
  className = "",
  onChange,
  options,
  value
}: SegmentedControlProps<T>) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
    const lastIndex = options.length - 1;
    let nextIndex: number | null = null;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    onChange(options[nextIndex].value);
  }

  return (
    <div
      aria-label={ariaLabel}
      className={[
        "surface-muted inline-flex w-full rounded-[var(--radius-md)] p-1",
        className
      ].join(" ")}
      role="tablist"
    >
      {options.map((option, index) => {
        const isActive = option.value === value;

        return (
          <button
            aria-selected={isActive}
            className={[
              "min-h-10 flex-1 rounded-[calc(var(--radius-md)-0.2rem)] px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(76,128,255,0.58)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-elevated)]",
              isActive
                ? "bg-[var(--bg-surface-strong)] text-white shadow-[inset_0_0_0_1px_rgba(76,128,255,0.18)]"
                : "text-[var(--text-muted)] hover:text-white"
            ].join(" ")}
            key={option.value}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
