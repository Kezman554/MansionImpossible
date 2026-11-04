// Vertical connectors: design data for stairs, lifts, slides and poles that join floors.
import type { PieceType } from '../../types/design'

export const CONNECTOR_TYPES = ['stairs', 'spiral-stairs', 'elevator', 'spiral-slide', 'slide', 'fireman-pole'] as const satisfies readonly PieceType[]
export type ConnectorType = (typeof CONNECTOR_TYPES)[number]

export interface ConnectorSpec {
  label: string
  /** Default footprint [width (x), depth (z)] in metres. Round connectors use the width as diameter. */
  footprint: [number, number]
  /** Round in plan: the footprint is a circle, sized by its diameter. */
  round: boolean
  /** The run (z) is fitted to the height, not chosen: straight stairs and slides. */
  fittedRun: boolean
  /** Whether the user can set the depth (elevators); otherwise it follows width or the run. */
  setDepth: boolean
  /** Main material id from the materials catalogue (the piece's material). */
  material: string
  /** Palette icon, an outline in a 24-unit box. */
  icon: string
}

export const CONNECTORS: Record<ConnectorType, ConnectorSpec> = {
  stairs: { label: 'Straight stairs', footprint: [1.2, 4], round: false, fittedRun: true, setDepth: false, material: 'oak', icon: 'M3 20h4v-4h4v-4h4V8h4V4h2' },
  'spiral-stairs': { label: 'Spiral stairs', footprint: [2.2, 2.2], round: true, fittedRun: false, setDepth: false, material: 'steel', icon: 'M12 3v18M12 6h7M12 10l-6 2M12 14l6 2M12 18H5' },
  elevator: { label: 'Elevator', footprint: [2, 2], round: false, fittedRun: false, setDepth: true, material: 'steel', icon: 'M5 3h14v18H5zM8 9h8v9H8zM10 6l2-1.5L14 6' },
  'spiral-slide': { label: 'Spiral slide', footprint: [3, 3], round: true, fittedRun: false, setDepth: false, material: 'slide-yellow', icon: 'M12 3v18M6 6c8-2 12 3 6 5S4 14 12 16s8 3 6 5' },
  slide: { label: 'Straight slide', footprint: [0.9, 6], round: false, fittedRun: true, setDepth: false, material: 'slide-yellow', icon: 'M3 5h3c4 0 7 14 12 14h3M3 8h3c4 0 7 14 12 14' },
  'fireman-pole': { label: "Fireman's pole", footprint: [1.2, 1.2], round: true, fittedRun: false, setDepth: false, material: 'brass', icon: 'M12 2v20M7 20h10M8 6h8' },
}

export const isConnectorType = (type: PieceType): type is ConnectorType => (CONNECTOR_TYPES as readonly PieceType[]).includes(type)
