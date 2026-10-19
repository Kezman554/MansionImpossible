export interface Segment<T extends string> {
  value: T
  label: string
  /** Unbuilt options stay visible but can't be chosen. */
  disabled?: boolean
}

interface SegmentedControlProps<T extends string> {
  label: string
  segments: Segment<T>[]
  value: T
  onChange: (value: T) => void
  /** 'accent' marks an active mode (coral); 'quiet' is for a plain setting. */
  tone?: 'accent' | 'quiet'
}

/** Pill group of mutually exclusive buttons. */
export function SegmentedControl<T extends string>({ label, segments, value, onChange, tone = 'quiet' }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={`segmented segmented--${tone}`}>
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          className="segmented__option"
          aria-pressed={segment.value === value}
          disabled={segment.disabled}
          title={segment.disabled ? `${segment.label} — coming soon` : undefined}
          onClick={() => onChange(segment.value)}
        >
          {segment.label}
        </button>
      ))}
    </div>
  )
}
