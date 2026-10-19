import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'

const SAMPLE_MS = 500

interface FpsProbeProps {
  /** Called twice a second with the frame rate; write to the DOM directly, don't set React state. */
  onSample: (fps: number) => void
}

/** Counts rendered frames inside the Canvas. Mounted only while the FPS overlay is on. */
export function FpsProbe({ onSample }: FpsProbeProps) {
  const sample = useRef({ start: 0, frames: 0 })

  useFrame(() => {
    const w = sample.current
    const now = performance.now()
    if (w.start === 0) w.start = now
    w.frames++
    const elapsed = now - w.start
    if (elapsed >= SAMPLE_MS) {
      onSample((w.frames * 1000) / elapsed)
      w.start = now
      w.frames = 0
    }
  })

  return null
}
