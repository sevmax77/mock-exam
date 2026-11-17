export type FilterOption<T extends string> = { value: T; label: string; count: number };

type FilterBarProps<T extends string> = {
  /** What the buttons filter, for screen readers ("Show questions"). */
  label: string;
  options: Array<FilterOption<T>>;
  value: T;
  onChange: (value: T) => void;
};

/** A row of toggle buttons that picks one filter; each shows how many items it matches. */
export function FilterBar<T extends string>({
  label,
  options,
  value,
  onChange,
}: FilterBarProps<T>) {
  return (
    <div className="filter-bar" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="filter-chip"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label} <span className="filter-count">{option.count}</span>
        </button>
      ))}
    </div>
  );
}
