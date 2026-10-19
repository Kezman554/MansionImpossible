// JSON export / import of a single design, for backups.
import { DESIGN_SCHEMA_VERSION, type Design } from '../types/design'

export class DesignFileError extends Error {}

export function serialiseDesign(design: Design): string {
  return JSON.stringify(design, null, 2)
}

/** "Kestrel Hall" → "kestrel-hall.mansion.json" */
export function designFileName(design: Design): string {
  const slug = design.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${slug || 'mansion'}.mansion.json`
}

type Check = (value: unknown) => boolean
const isString: Check = (v) => typeof v === 'string'
const isNumber: Check = (v) => typeof v === 'number' && Number.isFinite(v)
const isVec3: Check = (v) => Array.isArray(v) && v.length === 3 && v.every(isNumber)
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function checkList(data: Record<string, unknown>, key: string, kind?: string): void {
  const list = data[key]
  if (!Array.isArray(list)) throw new DesignFileError(`"${key}" is missing or not a list`)
  list.forEach((item, i) => {
    const ok =
      isRecord(item) &&
      isString(item.id) &&
      (kind === undefined
        ? isNumber(item.index) && isNumber(item.elevation) && isNumber(item.height)
        : item.kind === kind && isNumber(item.floor) && isVec3(item.position) && isVec3(item.rotation) && isVec3(item.scale))
    if (!ok) throw new DesignFileError(`${key}[${i}] is not a valid ${kind ?? 'floor'}`)
  })
}

/** Parses and checks a design file. Throws DesignFileError with a readable reason. */
export function parseDesign(text: string): Design {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new DesignFileError("This file isn't valid JSON")
  }
  if (!isRecord(data)) throw new DesignFileError("This file isn't a Mansion Impossible design")
  if (data.version !== DESIGN_SCHEMA_VERSION) {
    throw new DesignFileError(
      isNumber(data.version) ? `Design version ${data.version} isn't supported by this app` : "This file isn't a Mansion Impossible design",
    )
  }
  for (const key of ['id', 'name', 'createdAt', 'updatedAt']) {
    if (!isString(data[key])) throw new DesignFileError(`"${key}" is missing`)
  }
  checkList(data, 'floors')
  checkList(data, 'rooms', 'room')
  checkList(data, 'pieces', 'piece')
  checkList(data, 'furniture', 'furniture')
  const terrain = data.terrain
  if (!isRecord(terrain) || !Array.isArray(terrain.heights) || !terrain.heights.every(isNumber)) {
    throw new DesignFileError('"terrain" is missing or invalid')
  }
  if (!isRecord(data.settings)) throw new DesignFileError('"settings" is missing')
  return data as unknown as Design
}

/** Downloads the design as a .json file. */
export function downloadDesign(design: Design): void {
  const url = URL.createObjectURL(new Blob([serialiseDesign(design)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = designFileName(design)
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
