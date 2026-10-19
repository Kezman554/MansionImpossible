import { onFieldKeys, round2 } from './fieldKeys'

interface NumberFieldProps {
  label: string
  value: number
  onCommit: (value: number) => void
  disabled?: boolean
  title?: string
}

/**
 * A metres field that commits on Enter or blur (one undo step per edit); Escape puts the
 * value back. Uncontrolled and keyed on the value, so undo or a drag in the viewport refreshes it.
 */
export function NumberField({ label, value, onCommit, disabled, title }: NumberFieldProps) {
  const text = String(round2(value))
  return (
    <label className="field" title={title}>
      <span className="field__label">{label}</span>
      <input
        key={text}
        className="field__input"
        inputMode="decimal"
        defaultValue={text}
        disabled={disabled}
        onKeyDown={(e) => onFieldKeys(e, text)}
        onBlur={(e) => {
          const parsed = Number(e.currentTarget.value.replace(',', '.'))
          if (!Number.isFinite(parsed) || e.currentTarget.value.trim() === '') e.currentTarget.value = text
          else if (round2(parsed) !== round2(value)) onCommit(parsed)
        }}
      />
    </label>
  )
}
