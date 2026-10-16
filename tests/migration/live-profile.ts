import { createMainEngine } from '@/sudoku/mainEngine'
import { loadSudokuModule } from '@/sudoku/wasmModule'
import { VARIANT_FIXTURES } from '../fixtures/variants'
import { uniqueBoard, solvedBoard } from '../fixtures/sudoku'

export async function profileLiveOperations() {
  const engine = await createMainEngine(await loadSudokuModule())
  const fixtures = [
    { givens: uniqueBoard, solution: solvedBoard, rules: { kind: 'classic' as const } },
    ...Object.values(VARIANT_FIXTURES),
  ]
  const profiles: { variant: string; operation: string; p95Ms: number; maxMs: number }[] = []
  function measure(variant: string, operation: string, run: () => void) {
    for (let index = 0; index < 20; index++) {
      run()
    }
    const times: number[] = []
    for (let index = 0; index < 120; index++) {
      const started = performance.now()
      run()
      times.push(performance.now() - started)
    }
    times.sort((first, second) => first - second)
    profiles.push({
      variant,
      operation,
      p95Ms: times[Math.ceil(times.length * 0.95) - 1] ?? 0,
      maxMs: times.at(-1) ?? 0,
    })
  }

  try {
    for (const fixture of fixtures) {
      const variant = fixture.rules.kind
      const prepared = engine.prepare(fixture.rules)
      try {
        const empty = Array<number>(81).fill(0)
        measure(variant, 'candidates-empty', () => {
          const result = prepared.candidates({ board: empty }).result
          if (result.status !== 'complete') {
            throw new Error('Incomplete candidate profile')
          }
        })
        measure(variant, 'conflicts-empty', () => {
          const result = prepared.conflicts({ board: empty }).result
          if (result.status !== 'complete') {
            throw new Error('Incomplete conflict profile')
          }
        })
        measure(variant, 'generate-notes', () => {
          const result = prepared.edit({
            givens: [...fixture.givens],
            entries: empty,
            notes: empty,
            action: { kind: 'generate-notes' },
          }).result
          if (result.status !== 'complete') {
            throw new Error('Incomplete edit profile')
          }
        })
        measure(variant, 'validate-content', () => {
          const result = engine.validatePuzzle({ ...fixture, difficulty: 'easy' })
          if (result.status !== 'valid') {
            throw new Error('Invalid profile fixture')
          }
        })
        measure(variant, 'is-complete', () => {
          if (!prepared.isComplete(fixture.solution)) {
            throw new Error('Invalid profile solution')
          }
        })
        measure(variant, 'prepare-and-metadata', () => {
          const next = engine.prepare(fixture.rules)
          try {
            next.metadata()
          } finally {
            next.dispose()
          }
        })
      } finally {
        prepared.dispose()
      }
    }
    return profiles
  } finally {
    engine.dispose()
  }
}
