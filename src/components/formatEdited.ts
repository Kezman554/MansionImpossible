const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** "Edited today, 21:42" / "Edited yesterday" / "Edited 12 Oct" / "Edited 12 Oct 2025", in local time. */
export function formatEdited(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS)
  if (days <= 0) return `Edited today, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'Edited yesterday'
  const sameYear = date.getFullYear() === now.getFullYear()
  return `Edited ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })}`
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}
