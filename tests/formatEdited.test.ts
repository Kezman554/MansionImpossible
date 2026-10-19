import { describe, expect, it } from 'vitest'
import { formatEdited, plural } from '../src/components/formatEdited'

const now = new Date(2026, 9, 19, 22, 0)
const at = (...args: [number, number, number, number?, number?]) => new Date(...(args as [number, number, number, number, number])).toISOString()

describe('formatEdited', () => {
  it('says today with the time, yesterday, or the date', () => {
    expect(formatEdited(at(2026, 9, 19, 21, 42), now)).toBe('Edited today, 21:42')
    expect(formatEdited(at(2026, 9, 18, 23, 59), now)).toBe('Edited yesterday')
    expect(formatEdited(at(2026, 9, 12, 9, 0), now)).toBe('Edited 12 Oct')
    expect(formatEdited(at(2025, 11, 3, 9, 0), now)).toBe('Edited 3 Dec 2025')
  })

  it('pluralises counts', () => {
    expect([plural(1, 'floor'), plural(0, 'room'), plural(23, 'room')]).toEqual(['1 floor', '0 rooms', '23 rooms'])
  })
})
