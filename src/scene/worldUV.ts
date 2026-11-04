import { Float32BufferAttribute, type BufferGeometry } from 'three'

/**
 * Replaces a geometry's UVs with world-scale box mapping: each face takes the two coordinates
 * across it, in metres. A texture repeating every `scale` metres then tiles the same size on
 * every wall, floor and ceiling, however big — and continues across merged pieces.
 */
export function worldUVs<T extends BufferGeometry>(geometry: T): T {
  const pos = geometry.getAttribute('position')
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const normal = geometry.getAttribute('normal')
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const [nx, ny, nz] = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i)), Math.abs(normal.getZ(i))]
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)]
    const [u, v] = ny >= nx && ny >= nz ? [x, z] : nx >= nz ? [z, y] : [x, y]
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  return geometry
}
