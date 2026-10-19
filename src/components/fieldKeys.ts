import type { KeyboardEvent } from 'react'

export const round2 = (v: number) => Math.round(v * 100) / 100

/** Enter commits (by blurring), Escape puts the original value back. */
export function onFieldKeys(e: KeyboardEvent<HTMLInputElement>, original: string) {
  if (e.key === 'Enter') e.currentTarget.blur()
  if (e.key === 'Escape') {
    e.currentTarget.value = original
    e.currentTarget.blur()
  }
}
