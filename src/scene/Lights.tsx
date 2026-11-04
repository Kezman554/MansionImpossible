import type { ThreeEvent } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Euler,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type InstancedMesh,
  type LineSegments,
  type PointLight,
  type SpotLight,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { LIGHT_TYPES } from '../editor/catalog/lights'
import { assignLights, lightShown, poolSizes } from '../editor/lights'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { Light, LightType } from '../types/design'
import { gizmoHasPointer } from './gizmoState'
import { sharedMaterialById } from './materialCache'
import { overlayTokens } from './overlayTokens'
import type { QualityPreset } from './quality'
import { CLICK_TOLERANCE_PX, elevationOf } from './workPlane'

const noRaycast = () => null
const DOWN = new Vector3(0, -1, 0)

/** Fixture shapes per type, in metres around the light's anchor: a body and the part that glows. */
const FIXTURES: Record<LightType, { body: BufferGeometry; glow: BufferGeometry; box: { size: [number, number, number]; y: number } }> = {
  ceiling: {
    body: new CylinderGeometry(0.22, 0.22, 0.04, 20).translate(0, -0.02, 0),
    glow: new CylinderGeometry(0.17, 0.19, 0.03, 20).translate(0, -0.055, 0),
    box: { size: [0.5, 0.1, 0.5], y: -0.05 },
  },
  lamp: {
    body: mergeGeometries([new CylinderGeometry(0.16, 0.18, 0.04, 16).translate(0, 0.02, 0), new CylinderGeometry(0.015, 0.015, 1.32, 8).translate(0, 0.7, 0)]),
    glow: new CylinderGeometry(0.12, 0.22, 0.26, 16, 1, true).translate(0, 1.48, 0),
    box: { size: [0.5, 1.65, 0.5], y: 0.82 },
  },
  spot: {
    body: mergeGeometries([new CylinderGeometry(0.04, 0.04, 0.05, 8).translate(0, -0.025, 0), new CylinderGeometry(0.07, 0.08, 0.14, 14).translate(0, -0.12, 0)]),
    glow: new CylinderGeometry(0.06, 0.06, 0.01, 14).translate(0, -0.195, 0),
    box: { size: [0.25, 0.22, 0.25], y: -0.1 },
  },
  // Unit length along x; the instance scales x to the strip's length.
  strip: {
    body: new BoxGeometry(1, 0.03, 0.07).translate(0, -0.015, 0),
    glow: new BoxGeometry(0.98, 0.012, 0.045).translate(0, -0.036, 0),
    box: { size: [1, 0.08, 0.12], y: -0.03 },
  },
}

const _m = new Matrix4()
const _p = new Vector3()
const _q = new Quaternion()
const _s = new Vector3()
const _e = new Euler()
const _c = new Color()
const _dir = new Vector3()

function fixtureMatrix(l: Light, elevation: number, target: Matrix4, box?: { size: [number, number, number]; y: number }): Matrix4 {
  _q.setFromEuler(_e.set(...l.rotation))
  const length = l.type === 'strip' ? l.length : 1
  if (box) {
    _p.set(0, box.y, 0).applyQuaternion(_q).add(_s.set(l.position[0], l.position[1] + elevation, l.position[2]))
    return target.compose(_p, _q, _s.set(box.size[0] * length, box.size[1], box.size[2]))
  }
  return target.compose(_p.set(l.position[0], l.position[1] + elevation, l.position[2]), _q, _s.set(length, 1, 1))
}

/** Glowing parts take each light's colour (dimmed when it's off); unlit so they read at night. */
const glowMaterial = new MeshBasicMaterial({ toneMapped: false })

/** One light type's fixtures: two instanced meshes (body, glow), so draw calls don't grow with count. */
function Fixtures({ type, lights, elevationFor }: { type: LightType; lights: Light[]; elevationFor: (floor: number) => number }) {
  const body = useRef<InstancedMesh>(null)
  const glow = useRef<InstancedMesh>(null)
  const custom = useDesignStore((s) => s.design.customMaterials)
  const bodyMaterial = sharedMaterialById(type === 'lamp' ? 'brass' : 'frame-white', custom ?? [], 'frame-white')

  useLayoutEffect(() => {
    for (const m of [body.current, glow.current]) {
      if (!m) continue
      lights.forEach((l, i) => m.setMatrixAt(i, fixtureMatrix(l, elevationFor(l.floor), _m)))
      m.instanceMatrix.needsUpdate = true
      m.computeBoundingSphere()
    }
    const g = glow.current
    if (g) {
      lights.forEach((l, i) => g.setColorAt(i, _c.set(l.color).multiplyScalar(l.intensity > 0 ? 1 : 0.25)))
      if (g.instanceColor) g.instanceColor.needsUpdate = true
    }
  }, [lights, elevationFor])

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (useEditorStore.getState().tool !== 'select' || e.delta > CLICK_TOLERANCE_PX || gizmoHasPointer() || e.instanceId === undefined) return
    const light = lights[e.instanceId]
    if (!light) return
    e.stopPropagation()
    const store = useDesignStore.getState()
    useEditorStore.getState().selectOpening(null)
    if (e.shiftKey && store.selection.includes(light.id)) store.select(store.selection.filter((id) => id !== light.id))
    else store.select(light.id, { additive: e.shiftKey })
  }

  const f = FIXTURES[type]
  return (
    <>
      <instancedMesh key={`b${lights.length}`} ref={body} name="light-fixtures" userData={{ type }} args={[f.body, bodyMaterial, lights.length]} castShadow onClick={onClick} />
      <instancedMesh key={`g${lights.length}`} ref={glow} name="light-glow" userData={{ type }} args={[f.glow, glowMaterial, lights.length]} onClick={onClick} />
    </>
  )
}

const UNIT_EDGES = new EdgesGeometry(new BoxGeometry(1, 1, 1))

function SelectionBox({ light, elevation }: { light: Light; elevation: number }) {
  const lines = useRef<LineSegments>(null)
  useLayoutEffect(() => {
    const l = lines.current
    if (!l) return
    fixtureMatrix(light, elevation, l.matrix, FIXTURES[light.type].box)
    l.matrixWorldNeedsUpdate = true
  }, [light, elevation])
  return (
    <lineSegments ref={lines} geometry={UNIT_EDGES} matrixAutoUpdate={false} renderOrder={10} raycast={noRaycast}>
      <lineBasicMaterial color={overlayTokens.selection} depthTest={false} toneMapped={false} />
    </lineSegments>
  )
}

/** Where a point light sits for each fixture: just below a ceiling fixture, inside a lamp's shade. */
const EMIT_OFFSET: Record<LightType, number> = { ceiling: -0.2, lamp: 1.45, spot: -0.2, strip: -0.15 }

/**
 * The real lights: pools of point and spot lights, handed out each frame by assignLights — the
 * active floor first, then nearest the camera's target. Pools are sized by poolSizes: in steps of
 * four up to the quality's budget, so placing or deleting a light rarely changes the number of
 * lights (and shaders only recompile at a step), and a design without lights carries none. One
 * extra spotlight casts shadows for the light that asks, when the quality allows (with the sun:
 * two casters at most).
 */
function LightPools({ lights, budget, activeFloor, elevationFor }: { lights: Light[]; budget: QualityPreset['lights']; activeFloor: number; elevationFor: (floor: number) => number }) {
  const points = useRef<(PointLight | null)[]>([])
  const spots = useRef<(SpotLight | null)[]>([])
  const shadow = useRef<SpotLight>(null)
  const get = useThree((s) => s.get)
  const scene = useThree((s) => s.scene)

  // Spot targets must be in the scene for their matrices to update.
  useLayoutEffect(() => {
    const all = [...spots.current, shadow.current].filter((s): s is SpotLight => !!s)
    all.forEach((s) => scene.add(s.target))
    return () => all.forEach((s) => scene.remove(s.target))
  }, [scene, budget.spots, budget.shadowLights])

  useFrame(() => {
    const target = (get().controls as { target?: Vector3 } | null)?.target
    const assigned = assignLights(lights, activeFloor, { x: target?.x ?? 0, z: target?.z ?? 0 }, budget)
    const place = (slot: PointLight | SpotLight, l: Light | undefined, spot: boolean) => {
      if (!l) {
        slot.intensity = 0
        return
      }
      const y = l.position[1] + elevationFor(l.floor)
      slot.color.set(l.color)
      slot.intensity = l.intensity
      if (!spot) {
        slot.position.set(l.position[0], y + EMIT_OFFSET[l.type], l.position[2])
        return
      }
      const s = slot as SpotLight
      _dir.copy(DOWN).applyEuler(_e.set(...l.rotation))
      s.position.set(l.position[0], y, l.position[2]).addScaledVector(_dir, 0.2)
      s.target.position.copy(s.position).add(_dir)
      s.target.updateMatrixWorld()
      s.angle = l.type === 'spot' ? l.angle : 1.2
      s.penumbra = l.type === 'spot' ? 0.35 : 0.8
    }
    points.current.forEach((p, i) => p && place(p, assigned.points[i], false))
    spots.current.forEach((s, i) => s && place(s, assigned.spots[i], true))
    if (shadow.current) {
      place(shadow.current, assigned.shadow ?? undefined, true)
      shadow.current.shadow.autoUpdate = !!assigned.shadow
    }
  })

  return (
    <group name="light-pools">
      {Array.from({ length: budget.points }, (_, i) => (
        <pointLight key={`p${i}`} ref={(l) => void (points.current[i] = l)} intensity={0} decay={2} distance={18} />
      ))}
      {Array.from({ length: budget.spots }, (_, i) => (
        <spotLight key={`s${i}`} ref={(l) => void (spots.current[i] = l)} intensity={0} decay={2} distance={24} />
      ))}
      {budget.shadowLights > 0 && (
        <spotLight
          ref={shadow}
          name="light-shadow"
          intensity={0}
          decay={2}
          distance={24}
          castShadow
          shadow-mapSize={[budget.shadowMapSize, budget.shadowMapSize]}
          shadow-bias={-0.0008}
          shadow-camera-near={0.1}
        />
      )}
    </group>
  )
}

/**
 * Placed lights. Like floors, lights on floors above the one being edited are hidden and off;
 * the rest show their fixtures and share the quality's pool of real lights.
 */
export function Lights({ quality }: { quality: QualityPreset }) {
  const all = useDesignStore((s) => s.design.lights)
  const floors = useDesignStore((s) => s.design.floors)
  const selection = useDesignStore((s) => s.selection)
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const elevationFor = useMemo(() => (floor: number) => elevationOf(floors, floor), [floors])
  const shown = useMemo(() => (all ?? []).filter((l) => lightShown(l, activeFloor)), [all, activeFloor])
  // Sized to the lights shown, in steps (see poolSizes), capped by the quality.
  const sizes = poolSizes(shown, quality.lights)
  const pools = useMemo(() => sizes, [sizes.points, sizes.spots, sizes.shadowLights, sizes.shadowMapSize]) // eslint-disable-line react-hooks/exhaustive-deps
  const byType = useMemo(() => LIGHT_TYPES.map((type) => [type, shown.filter((l) => l.type === type)] as const), [shown])

  return (
    <group name="lights">
      {byType.map(([type, list]) => list.length > 0 && <Fixtures key={type} type={type} lights={list} elevationFor={elevationFor} />)}
      {shown
        .filter((l) => selection.includes(l.id))
        .map((l) => (
          <SelectionBox key={l.id} light={l} elevation={elevationFor(l.floor)} />
        ))}
      <LightPools lights={shown} budget={pools} activeFloor={activeFloor} elevationFor={elevationFor} />
    </group>
  )
}
