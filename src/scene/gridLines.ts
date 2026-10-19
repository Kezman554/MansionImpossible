/**
 * Line-segment vertices for a ground grid on y = 0, centred on the origin.
 * Minor lines every `cell` metres, major lines every `major` metres; a line that is
 * major is left out of the minor set so the two never overlap.
 *
 * Each line is split into pieces at most `major` metres long: a single plot-length
 * segment with one end behind the camera can be dropped whole by some renderers
 * (seen in Chrome's software renderer), losing every grid line that passes the camera.
 */
export function gridLines(size: [number, number], cell = 1, major = 10): { minor: Float32Array; major: Float32Array } {
  const [halfX, halfZ] = [Math.floor(size[0] / 2 / cell) * cell, Math.floor(size[1] / 2 / cell) * cell]
  const minor: number[] = []
  const majors: number[] = []
  const isMajor = (v: number) => Math.abs(Math.round(v / major) * major - v) < 1e-6

  /** Pushes the line from `from` to `to` along one axis as pieces of at most `major` metres. */
  const pushLine = (target: number[], fixed: number, from: number, to: number, alongX: boolean) => {
    for (let a = from; a < to - 1e-6; a += major) {
      const b = Math.min(a + major, to)
      if (alongX) target.push(a, 0, fixed, b, 0, fixed)
      else target.push(fixed, 0, a, fixed, 0, b)
    }
  }

  for (let x = -halfX; x <= halfX + 1e-6; x += cell) pushLine(isMajor(x) ? majors : minor, x, -halfZ, halfZ, false)
  for (let z = -halfZ; z <= halfZ + 1e-6; z += cell) pushLine(isMajor(z) ? majors : minor, z, -halfX, halfX, true)
  return { minor: new Float32Array(minor), major: new Float32Array(majors) }
}
