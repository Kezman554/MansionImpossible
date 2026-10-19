import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOSAVE_DELAY, createAutosave, type Autosave } from '../src/storage/autosave'
import { useAppStore } from '../src/store/appStore'
import { createDesign, useDesignStore } from '../src/store/designStore'
import type { Design } from '../src/types/design'

const sofa = { kind: 'furniture' as const, catalogId: 'sofa', material: null }
const storageFull = () => new DOMException('full', 'QuotaExceededError')

let saved: Design[]
let save: ReturnType<typeof vi.fn<(design: Design) => Promise<void>>>
let autosave: Autosave

beforeEach(() => {
  vi.useFakeTimers()
  saved = []
  save = vi.fn(async (design: Design) => void saved.push(design))
  autosave = createAutosave({ save })
  useAppStore.setState({ toast: null, saveProblem: null })
  autosave.open(createDesign('Kestrel Hall'))
})

afterEach(() => {
  autosave.stop()
  vi.useRealTimers()
})

describe('autosave', () => {
  it('does not save a design just because it was opened', async () => {
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY * 2)
    expect(save).not.toHaveBeenCalled()
  })

  it('debounces a burst of edits into one save of the latest design', async () => {
    for (let i = 0; i < 5; i++) useDesignStore.getState().addObject(sofa)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY - 1)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(saved[0].furniture).toHaveLength(5)
  })

  it('shows a brief Saved toast', async () => {
    useDesignStore.getState().addObject(sofa)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY)
    expect(useAppStore.getState().toast).toMatchObject({ message: 'Saved', tone: 'saved' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(useAppStore.getState().toast).toBeNull()
  })

  it('raises a persistent save problem on failure, and Try again clears it', async () => {
    save.mockRejectedValueOnce(storageFull())
    useDesignStore.getState().addObject(sofa)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY)

    const problem = useAppStore.getState().saveProblem
    expect(problem?.message).toBe("Couldn't save — this browser's storage is full")
    expect(problem?.design?.furniture).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(useAppStore.getState().saveProblem).not.toBeNull()

    problem!.retry()
    await vi.advanceTimersByTimeAsync(0)
    expect(useAppStore.getState().saveProblem).toBeNull()
    expect(saved.at(-1)?.furniture).toHaveLength(1)
  })

  it('close() saves pending edits first, and refuses to close if that save fails', async () => {
    useDesignStore.getState().addObject(sofa)
    save.mockRejectedValueOnce(storageFull())
    expect(await autosave.close()).toBe(false)
    expect(await autosave.close()).toBe(true)
    expect(saved).toHaveLength(1)

    useDesignStore.getState().addObject(sofa)
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY)
    expect(saved).toHaveLength(1)
  })
})
