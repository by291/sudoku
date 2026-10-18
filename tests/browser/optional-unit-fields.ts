import { createLessons } from '../support/lessons'
import { createMainEngine } from '@/sudoku/mainEngine'
import { loadSudokuModule } from '@/sudoku/wasmModule'

export async function probeOptionalUnitFields() {
  const engine = await createMainEngine(await loadSudokuModule())
  try {
    const stage = createLessons()[0]?.guided
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
