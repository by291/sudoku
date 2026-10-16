import { createLessons } from '@/features/learning/model/lessons'
import { createMainEngine } from '@/sudoku/mainEngine'
import { loadSudokuModule } from '@/sudoku/wasmModule'
import { VARIANT_FIXTURES } from '../fixtures/variants'
import { uniqueBoard, solvedBoard } from '../fixtures/sudoku'

export async function profileLiveOperations(compiled?: WebAssembly.Module) {
  const engine = await createMainEngine(compiled ?? (await loadSudokuModule()))
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
        const noGivens = Array<0>(81).fill(0)
        const filledEntry: (0 | 1)[] = [...noGivens]
        filledEntry[0] = 1
        for (const action of [
          { kind: 'enter', cell: 0, digit: 1 },
          { kind: 'erase', cell: 0 },
          { kind: 'toggle-note', cell: 0, digit: 1 },
        ] as const) {
          measure(variant, action.kind, () => {
            prepared.edit({
              givens: noGivens,
              entries: action.kind === 'erase' ? filledEntry : noGivens,
              notes: Array(81).fill(511),
              action,
            })
          })
        }
        measure(variant, 'review-entries', () => {
          prepared.reviewEntries(fixture.givens, fixture.solution)
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
    measure('course', 'construct-and-validate', () => {
      if (createLessons(engine).length !== 32) {
        throw new Error('Incomplete course profile')
      }
    })
    return profiles
  } finally {
    engine.dispose()
  }
}

export async function probeOptionalUnitFields() {
  const engine = await createMainEngine(await loadSudokuModule())
  try {
    const stage = createLessons(engine)[0]?.guided
    if (!stage || stage.step.kind !== 'placement' || stage.step.evidence.kind !== 'unit') {
      throw new Error('Missing authored unit placement')
    }
    const evidence = Object.freeze({ ...stage.step.evidence, units: undefined })
    const step = Object.freeze({ ...stage.step, evidence })
    const hint = {
      kind: 'deduction',
      steps: [step],
      placement: { cell: step.cell, digit: step.digit },
    }
    const nullEvidence = { ...evidence, units: null }
    const nullStep = { ...step, evidence: nullEvidence }
    return {
      teaching: engine.validateTeachingStep({ ...stage, step }).status,
      shape: engine.parseHint(hint).status,
      proof: engine.validateHint({ hint, rules: stage.rules, board: stage.board }).status,
      nullTeaching: engine.validateTeachingStep({ ...stage, step: nullStep }).status,
      nullShape: engine.parseHint({ ...hint, steps: [nullStep] }).status,
      nullProof: engine.validateHint({
        hint: { ...hint, steps: [nullStep] },
        rules: stage.rules,
        board: stage.board,
      }).status,
      originalUnchanged: Object.hasOwn(evidence, 'units') && evidence.units === undefined,
    }
  } finally {
    engine.dispose()
  }
}
