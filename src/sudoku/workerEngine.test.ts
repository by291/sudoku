import { expect, it, vi } from 'vitest'
import { createWorkerEngine } from '@/sudoku/workerEngine'
import { getTestModule } from '../../tests/support/wasm'

it('heavy_live_work_stops_on_deadline_without_mutating_input', async () => {
  const engine = await createWorkerEngine(getTestModule())
  const rules = {
    kind: 'killer' as const,
    cages: Array.from({ length: 9 }, (_, row) => ({
      cells: Array.from({ length: 9 }, (_, column) => row * 9 + column),
      sum: 45,
    })),
  }
  const empty = Array<0>(81).fill(0)
  const notes = Array<number>(81).fill(7)

  const clock = vi.spyOn(performance, 'now')
  clock.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(3001)
  try {
    expect(() => engine.generateNotes({ givens: empty, entries: empty, notes, rules })).toThrow(
      'Computation timed out',
    )
    expect(notes).toEqual(Array(81).fill(7))
  } finally {
    clock.mockRestore()
  }
})
