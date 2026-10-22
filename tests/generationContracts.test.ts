// @vitest-environment node
import { expect, it } from 'vitest'
import { parseGenerationInput } from '@/sudoku/generationInput'
import { assessPuzzle, generatePuzzle } from './support/engine'
import { createAssessmentInput } from './support/assessment'
import fixtures from './fixtures/engine-contracts/generation.json'
import { referenceCountSolutions } from './support/referenceVariants'
import { structureIssues } from './support/variantStructure'
import { countReferenceSolutions } from './support/referenceSudoku'

// Reuse independently sealed request bytes, one accepted request per supported identity.
const requests = new Map<string, (typeof fixtures)[number]['input']>()
for (const fixture of fixtures) {
  const identity = `${fixture.input.variant}/${fixture.input.difficulty}`
  if (fixture.expected.status === 'ready' && !requests.has(identity)) {
    requests.set(identity, fixture.input)
  }
}

it('covers the nineteen supported generation identities', () => {
  expect(requests.size).toBe(19)
})

it.each([...requests])(
  'independently checks generated solution and trace safety for %s',
  (_, raw) => {
    const parsed = parseGenerationInput({
      ...raw,
      puzzleVersion: raw.variant === 'classic' ? 'sudoku-v12' : 'sudoku-variants-v12',
      seed: Uint8Array.from(raw.seed),
    })
    if (!parsed.valid) {
      throw new Error('Invalid sealed generation input')
    }
    const result = generatePuzzle(parsed.value)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') {
      throw new Error('Missing generated puzzle')
    }
    const { puzzle } = result

    expect(structureIssues(puzzle.solution, puzzle.rules)).toEqual([])
    expect(referenceCountSolutions(puzzle.givens, puzzle.rules)).toEqual({
      count: 1,
      solution: puzzle.solution,
    })
    if (
      puzzle.rules.kind !== 'classic' &&
      structureIssues(puzzle.solution, { kind: 'classic' }).length === 0
    ) {
      expect(countReferenceSolutions(puzzle.givens, 2), 'Independent variant necessity').not.toBe(1)
    }

    // Both summaries come from Rust: this assertion checks endpoint consistency only.
    const rating = assessPuzzle(createAssessmentInput(puzzle.givens, puzzle.rules))
    expect(rating).toMatchObject({ status: 'rated', summary: result.assessment })
    if (rating.status !== 'rated') {
      throw new Error('Missing complete assessment')
    }
    for (const step of rating.trace) {
      if (step.kind === 'placement') {
        expect(step.digit, 'Placement matches independently unique solution').toBe(
          puzzle.solution[step.cell],
        )
      } else {
        for (const removal of step.removals) {
          expect(removal.digit, 'Elimination retains independently unique solution').not.toBe(
            puzzle.solution[removal.cell],
          )
        }
      }
    }
  },
  30000,
)
