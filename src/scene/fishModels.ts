// Low-poly fish built in code (nothing fetched): a faceted body and a tail fin, nose along +x,
// centred on the origin, at the species' size in metres. One geometry per species, shared by
// every fish of that kind through instancing.
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { FISH, type FishSpecies } from '../editor/catalog/fish'

type P = [number, number, number]

function triangles(list: [P, P, P][]): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(list.flat(2), 3))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** A diamond body (nose, tail root, top, bottom, two sides) plus a fin as two back-to-back triangles. */
function build(length: number, height: number, width: number, opts: { tail: number; finTop?: number; round?: boolean }): BufferGeometry {
  const nose: P = [length / 2, 0, 0]
  const root: P = [-length * 0.3, 0, 0]
  const mid = opts.round ? 0.05 * length : 0.1 * length
  const top: P = [mid, height / 2, 0]
  const bottom: P = [mid, -height / 2, 0]
  const left: P = [mid, 0, -width / 2]
  const right: P = [mid, 0, width / 2]
  const tris: [P, P, P][] = [
    [nose, top, right], [nose, right, bottom], [nose, bottom, left], [nose, left, top],
    [root, right, top], [root, bottom, right], [root, left, bottom], [root, top, left],
  ]
  // Tail fin: a forked triangle behind the root, seen from both sides.
  const tip: P = [-length / 2, 0, 0]
  const up: P = [-length / 2 - length * 0.08, opts.tail, 0]
  const down: P = [-length / 2 - length * 0.08, -opts.tail, 0]
  tris.push([root, up, tip], [root, tip, up], [root, tip, down], [root, down, tip])
  // Angelfish: tall dorsal and anal fins.
  if (opts.finTop) {
    const finUp: P = [-length * 0.15, height / 2 + opts.finTop, 0]
    const finDown: P = [-length * 0.15, -height / 2 - opts.finTop, 0]
    tris.push([top, root, finUp], [top, finUp, root], [bottom, finDown, root], [bottom, root, finDown])
  }
  return triangles(tris)
}

const cache = new Map<FishSpecies, BufferGeometry>()

export function fishGeometry(species: FishSpecies): BufferGeometry {
  let g = cache.get(species)
  if (!g) {
    const [l, h, w] = FISH[species].size
    g =
      species === 'tetra'
        ? build(l, h, w, { tail: h * 0.6 })
        : species === 'angelfish'
          ? build(l, h * 0.55, w, { tail: h * 0.35, finTop: h * 0.25 })
          : build(l, h, w, { tail: h * 0.35, round: true })
    cache.set(species, g)
  }
  return g
}
