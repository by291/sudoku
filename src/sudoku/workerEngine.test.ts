import { expect, it } from 'vitest'
import { createWorkerEngine } from '@/sudoku/workerEngine'
import { getTestModule } from '../../tests/support/wasm'

it('heavy_live_work_preserves_the_full_allowance_and_atomic_exhaustion', async () => {
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

  const conflicts = engine.conflicts(empty, rules)
  const editing = engine.generateNotes({ givens: empty, entries: empty, notes, rules })

  expect(conflicts.preparationWork).toBeGreaterThan(0)
  expect(conflicts.preparationWork).toBeLessThanOrEqual(1000000)
  expect(conflicts.computation).toEqual({
    result: { status: 'budget-exhausted', violations: [] },
    workUsed: 1000000,
  })
  expect(editing.computation).toEqual({ result: { status: 'budget-exhausted' }, workUsed: 1000000 })
  expect(notes).toEqual(Array(81).fill(7))
})
