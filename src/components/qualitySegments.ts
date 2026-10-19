import { QUALITY_PRESETS } from '../scene/quality'
import { QUALITY_LEVELS, type Quality } from '../types/appSettings'
import type { Segment } from './SegmentedControl'

export const QUALITY_SEGMENTS: Segment<Quality>[] = QUALITY_LEVELS.map((value) => ({ value, label: QUALITY_PRESETS[value].label }))
