"use client";

export interface ChipOption {
  value: string;
  label: string;
  count?: number;
}

export interface FilterChipsProps {
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

/** Horizontally scrollable sentence-case filter chips with optional counts. */
export function FilterChips({ options, value, onChange, ariaLabel = "Filter" }: FilterChipsProps) {
  return (
    <div className="chip-row" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={selected ? "chip selected" : "chip"}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count !== undefined ? <span className="chip-count">{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
