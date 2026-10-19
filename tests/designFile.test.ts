import { describe, expect, it } from 'vitest'
import { designFileName, DesignFileError, parseDesign, serialiseDesign } from '../src/storage/designFile'
import { createDesign } from '../src/store/designStore'

describe('design JSON files', () => {
  it('round-trips a design', () => {
    const design = {
      ...createDesign('Kestrel Hall'),
      furniture: [{ id: 'f', kind: 'furniture' as const, catalogId: 'sofa', material: null, floor: 0, position: [1, 0, 1] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number] }],
    }
    expect(parseDesign(serialiseDesign(design))).toEqual(design)
  })

  it('names the file after the design', () => {
    expect(designFileName(createDesign('Wayne Manor, east wing'))).toBe('wayne-manor-east-wing.mansion.json')
    expect(designFileName(createDesign('!!!'))).toBe('mansion.mansion.json')
  })

  it.each([
    ['not JSON', '{oops', "isn't valid JSON"],
    ['another JSON file', '{"hello": 1}', "isn't a Mansion Impossible design"],
    ['a newer version', JSON.stringify({ ...createDesign('x'), version: 99 }), 'version 99'],
    ['a missing list', JSON.stringify({ ...createDesign('x'), rooms: undefined }), '"rooms"'],
    ['a broken object', JSON.stringify({ ...createDesign('x'), pieces: [{ id: 'p', kind: 'piece', floor: 0, position: [0, 0] }] }), 'pieces[0]'],
  ])('rejects %s with a readable reason', (_, text, reason) => {
    expect(() => parseDesign(text)).toThrow(DesignFileError)
    expect(() => parseDesign(text)).toThrow(reason)
  })
})
