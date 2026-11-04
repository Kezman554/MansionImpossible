import { Edges, Line } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, CylinderGeometry, type BufferGeometry, type Mesh } from 'three'
import { DEFAULT_TANK_SIZE, moveTank, tankSpan } from '../editor/tank'
import { useDesignStore } from '../store/designStore'
import { useEditorStore } from '../store/editorStore'
import type { FishTank as Tank, TankShape } from '../types/design'
import { gizmoHasPointer } from './gizmoState'
import { overlayTokens } from './overlayTokens'
import { createWaterMaterial, type WaterMaterial } from './waterMaterial'
import { CLICK_TOLERANCE_PX, elevationOf, pointAtHeight } from './workPlane'

const CIRCLE_SEGMENTS = 48
const noRaycast = () => null

/** Footprint outline at height y: the rectangle, or the circle for a cylinder. */
function footprint(shape: TankShape, size: [number, number], cx: number, cz: number, y: number): [number, number, number][] {
  if (shape === 'cylindrical') {
    const r = size[0] / 2
    return Array.from({ length: CIRCLE_SEGMENTS + 1 }, (_, i) => {
      const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2
      return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]
    })
  }
  const [w, d] = size
  const [x0, x1, z0, z1] = [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2]
  return [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, y, z0]]
}

interface MoveDrag {
  start: { x: number; z: number }
  from: [number, number]
  height: number
  checkpointed: boolean
}

/** Select tool on the tank: click selects it, dragging the selected tank moves it (one undo step). */
function useTankPointer(tank: Tank, elevation: number) {
  const get = useThree((s) => s.get)
  const drag = useRef<MoveDrag | null>(null)
  const selecting = () => useEditorStore.getState().tool === 'select'
  const isSelected = () => useDesignStore.getState().selection.includes(tank.id)
  const setOrbit = (enabled: boolean) => {
    const controls = get().controls as { enabled: boolean } | null
    if (controls) controls.enabled = enabled
  }
  const setCursor = (cursor: string) => {
    get().gl.domElement.style.cursor = cursor
  }

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || !selecting() || gizmoHasPointer()) return
    e.stopPropagation()
    if (!isSelected()) return // the first click selects (onClick)
    const start = pointAtHeight(e.ray, elevation)
    if (!start) return
    drag.current = { start, from: tank.position, height: elevation, checkpointed: false }
    setOrbit(false)
    ;(e.target as unknown as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current
    if (!d) {
      if (selecting()) setCursor(isSelected() ? 'move' : 'pointer')
      return
    }
    e.stopPropagation()
    const p = pointAtHeight(e.ray, d.height)
    const store = useDesignStore.getState()
    const current = store.design.tank
    if (!p || !current) return
    const next = moveTank(current, d.from, p.x - d.start.x, p.z - d.start.z)
    if (next.position[0] === current.position[0] && next.position[1] === current.position[1]) return
    if (!d.checkpointed) {
      store.checkpoint()
      d.checkpointed = true
      useEditorStore.getState().setDragging(true)
    }
    store.applyDesign({ ...store.design, tank: next }, { record: false })
  }

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    drag.current = null
    setOrbit(true)
    useEditorStore.getState().setDragging(false)
    ;(e.target as unknown as Element).releasePointerCapture(e.pointerId)
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (!selecting() || e.delta > CLICK_TOLERANCE_PX || gizmoHasPointer()) return
    e.stopPropagation()
    useEditorStore.getState().selectOpening(null)
    useDesignStore.getState().select(tank.id)
  }

  const onPointerOut = () => {
    if (!drag.current) setCursor('')
  }

  return { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onPointerOut, onClick }
}

/**
 * The central fish tank: one water volume from the lowest floor to the highest. Like rooms,
 * floors above the one being edited are hidden, so the visible water stops at the top of the
 * active floor (and starts there too when floors below are hidden).
 */
function TankVolume({ tank, caustics }: { tank: Tank; caustics: boolean }) {
  const floors = useDesignStore((s) => s.design.floors)
  const selected = useDesignStore((s) => s.selection.includes(tank.id))
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const belowFloors = useEditorStore((s) => s.belowFloors)
  const active = floors.find((f) => f.index === activeFloor)
  const span = tankSpan(floors)
  const elevation = elevationOf(floors, activeFloor)
  const bottom = belowFloors === 'hide' || !span ? elevation : span.bottom
  const top = elevation + (active?.height ?? 3)
  const height = Math.max(0.01, top - bottom)
  const [w, d] = tank.size

  const geometry = useMemo<BufferGeometry>(
    () => (tank.shape === 'cylindrical' ? new CylinderGeometry(w / 2, w / 2, height, CIRCLE_SEGMENTS) : new BoxGeometry(w, height, d)),
    [tank.shape, w, d, height],
  )
  useEffect(() => () => geometry.dispose(), [geometry])

  const material = useMemo(() => createWaterMaterial(caustics), [caustics])
  useEffect(() => () => material.dispose(), [material])
  // Uniforms are set through the mesh: depth shading runs over the tank's full height.
  const water = useRef<Mesh>(null)
  const uniforms = () => (water.current?.material as WaterMaterial | undefined)?.uniforms
  const depthBottom = span?.bottom ?? bottom
  useEffect(() => {
    const u = uniforms()
    if (!u) return
    u.uTop.value = top
    u.uBottom.value = depthBottom
  })
  useFrame(({ clock }) => {
    if (!caustics) return
    const u = uniforms()
    if (u) u.uTime.value = clock.getElapsedTime()
  })

  const pointer = useTankPointer(tank, elevation)
  const [cx, cz] = tank.position

  return (
    <group name="fish-tank">
      <mesh ref={water} name="tank-water" position={[cx, bottom + height / 2, cz]} geometry={geometry} material={material} renderOrder={1} {...pointer}>
        <Edges threshold={20} color={overlayTokens.water} raycast={noRaycast} />
      </mesh>
      {selected && (
        <>
          <Line points={footprint(tank.shape, tank.size, cx, cz, elevation + 0.03)} color={overlayTokens.selection} lineWidth={2.5} depthTest={false} renderOrder={10} raycast={noRaycast} />
          <Line points={footprint(tank.shape, tank.size, cx, cz, top + 0.01)} color={overlayTokens.selection} lineWidth={2.5} depthTest={false} renderOrder={10} raycast={noRaycast} />
        </>
      )}
    </group>
  )
}

/** Where the fish tank tool would put the tank: its footprint outlined on the active floor. */
function TankPreview({ tank }: { tank: Tank | null }) {
  const preview = useEditorStore((s) => s.tankPreview)
  const activeFloor = useEditorStore((s) => s.activeFloor)
  const elevation = useDesignStore((s) => elevationOf(s.design.floors, activeFloor))
  if (!preview) return null
  const shape = tank?.shape ?? 'rectangular'
  const size = tank?.size ?? DEFAULT_TANK_SIZE
  return <Line points={footprint(shape, size, preview.x, preview.z, elevation + 0.04)} color={overlayTokens.water} lineWidth={2.5} dashed dashSize={0.3} gapSize={0.15} depthTest={false} renderOrder={10} raycast={noRaycast} />
}

export function FishTank({ caustics }: { caustics: boolean }) {
  const tank = useDesignStore((s) => s.design.tank)
  return (
    <>
      {tank && <TankVolume tank={tank} caustics={caustics} />}
      <TankPreview tank={tank} />
    </>
  )
}
