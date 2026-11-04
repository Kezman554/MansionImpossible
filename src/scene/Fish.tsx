import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { Color, Euler, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type Group, type InstancedMesh } from 'three'
import { FISH, FISH_SPECIES } from '../editor/catalog/fish'
import { resolveMaterial } from '../editor/catalog/materials'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import { createSchool, fishCount, fishFloorsShown, floorBounds, stepSchool, type School } from './fishSchool'
import { fishGeometry } from './fishModels'
import type { QualityPreset } from './quality'

const noRaycast = () => null
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** True while the person asks for reduced motion (follows the setting as it changes). */
function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia(REDUCED_MOTION)
    const onChange = () => setReduce(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduce
}

/** One white, flat-shaded material for every fish; each fish's colour comes from its instance colour. */
const fishMaterial = new MeshStandardMaterial({ flatShading: true, roughness: 0.55, metalness: 0.05 })
const COLOURS = FISH_SPECIES.map((s) => FISH[s].colours.map((id) => new Color(resolveMaterial(id)!.color)))

const _m = new Matrix4()
const _p = new Vector3()
const _q = new Quaternion()
const _e = new Euler(0, 0, 0, 'YZX')
const _s = new Vector3(1, 1, 1)

interface Entry {
  school: School
  key: string
}

/**
 * Fish in the tank: a school per floor (boids, src/scene/fishSchool.ts), drawn with one instanced
 * mesh per species. Only floors on screen swim; hidden floors' schools pause where they are (no
 * steps, not drawn) and carry on when shown again. The quality setting sets how many swim.
 */
export function Fish({ quality }: { quality: QualityPreset }) {
  const tank = useDesignStore((s) => s.design.tank)
  const floors = useDesignStore((s) => s.design.floors)
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const belowFloors = useEditorStore((s) => s.belowFloors)
  const group = useRef<Group>(null)
  const meshes = useRef<(InstancedMesh | null)[]>([])
  const schools = useRef(new Map<number, Entry>())
  const perFloor = quality.fishPerFloor
  const capacity = Math.max(1, (tank ? fishCount(tank, perFloor) : 0) * floors.length)
  // prefers-reduced-motion: the fish hold still (drawn where they are, no steps, no tail beat).
  const still = useReducedMotion()

  useFrame((_, delta) => {
    const g = group.current
    if (!g || !tank) return
    const shown = fishFloorsShown(floors, activeFloor, belowFloors)
    const used = FISH_SPECIES.map(() => 0)
    const report: Record<number, { count: number; steps: number; shown: boolean }> = {}
    for (const floor of floors) {
      const bounds = floorBounds(tank, floor)
      const count = fishCount(tank, perFloor)
      const key = `${count}`
      let entry = schools.current.get(floor.index)
      if (!entry || entry.key !== key) {
        entry = { school: createSchool(count, bounds, 1000 + floor.index * 7919), key }
        schools.current.set(floor.index, entry)
      }
      const visible = shown.includes(floor)
      report[floor.index] = { count, steps: entry.school.steps, shown: visible }
      // Hidden floors are paused: no simulation, nothing drawn.
      if (!visible) continue
      if (!still) stepSchool(entry.school, bounds, delta)
      report[floor.index].steps = entry.school.steps
      const s = entry.school
      for (let i = 0; i < s.count; i++) {
        const species = s.species[i]
        const mesh = meshes.current[species]
        if (!mesh || used[species] >= mesh.instanceMatrix.count) continue
        const [vx, vy, vz] = [s.velocity[i * 3], s.velocity[i * 3 + 1], s.velocity[i * 3 + 2]]
        // Face the way it swims, nose (+x) along the velocity; the tail beat wags the body.
        _e.set(0, Math.atan2(-vz, vx) + Math.sin(s.phase[i]) * 0.18, Math.atan2(vy, Math.hypot(vx, vz)))
        _q.setFromEuler(_e)
        _p.set(s.position[i * 3], s.position[i * 3 + 1], s.position[i * 3 + 2])
        mesh.setMatrixAt(used[species], _m.compose(_p, _q, _s))
        mesh.setColorAt(used[species], COLOURS[species][s.colour[i]])
        used[species]++
      }
    }
    meshes.current.forEach((mesh, k) => {
      if (!mesh) return
      mesh.count = used[k]
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
    g.userData.schools = report
    g.userData.still = still
    g.userData.drawn = used.reduce((a, b) => a + b, 0)
  })

  if (!tank) return null
  return (
    <group ref={group} name="fish">
      {FISH_SPECIES.map((species, k) => (
        <instancedMesh
          key={`${species}-${capacity}`}
          ref={(m) => void (meshes.current[k] = m)}
          name={`fish-${species}`}
          args={[fishGeometry(species), fishMaterial, capacity]}
          frustumCulled={false}
          raycast={noRaycast}
          castShadow={false}
        />
      ))}
    </group>
  )
}
