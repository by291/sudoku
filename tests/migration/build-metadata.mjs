import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEngine } from './reference-loader.mjs'
import { fixtureRoot } from './suites.mjs'

const engine = await loadEngine({ v11: true })
const authored = JSON.parse(readFileSync(resolve(fixtureRoot, 'assessment.json'), 'utf8'))
const solved = authored[0].input.solution
const board = solved.map((digit, cell) => (cell === 40 ? 0 : digit))
const baseline = engine.assessPuzzle(
  engine.createAssessmentInput(board, { kind: 'classic' }),
).summary
const identity = { variant: 'classic', difficulty: 'easy' }
const rows = []
function add(id, operation, value, present = true, expectedIdentity = identity) {
  const input = { operation, present, identity: expectedIdentity, ...(present ? { value } : {}) }
  let expected
  if (operation === 'summary') expected = engine.parseAssessmentSummary(value)
  else if (operation === 'outcome') expected = engine.parseAssessmentOutcome(value)
  else {
    const decoded = engine.decodePuzzleAssessment(present ? value : undefined, expectedIdentity)
    expected = decoded === undefined ? { present: false } : { present: true, value: decoded }
  }
  rows.push({ id, input, expected })
}
for (const row of authored) add(`valid:${row.id}`, 'summary', row.expected.result.summary)
for (const [index, change] of [
  { steps: -1 },
  { placements: 0.5 },
  { steps: 9007199254740992 },
  { steps: 2 },
  { eliminations: 1 },
  { candidateRemovals: 1 },
  { variantSteps: 2 },
  { highestTier: 'hard' },
  { highestTechnique: 'hidden-pair' },
  { highestTechnique: null },
  { highestTier: 'unknown' },
  { highestTechnique: 'unknown' },
  { steps: undefined },
  { highestTechnique: undefined },
  { highestTier: undefined },
].entries())
  add(`workload:${index}`, 'summary', {
    ...baseline,
    workload: { ...baseline.workload, ...change },
  })
const missing = { ...baseline.workload.techniqueCounts }
delete missing['hidden-pair']
for (const [index, counts] of [
  missing,
  { ...baseline.workload.techniqueCounts, unknown: 0 },
  { ...baseline.workload.techniqueCounts, 'cage-distinct': 1 },
  { ...baseline.workload.techniqueCounts, 'naked-single': -1 },
].entries())
  add(`counts:${index}`, 'summary', {
    ...baseline,
    workload: { ...baseline.workload, techniqueCounts: counts },
  })
for (const [index, spec] of [
  ['classic', 'naked-single', 0, 1, 0],
  ['classic', 'hidden-single', 0, 1, 0],
  ['classic', 'locked-candidate', 1, 0, 0],
  ['classic', 'naked-pair', 1, 0, 0],
  ['classic', 'hidden-pair', 1, 0, 0],
  ['killer', 'cage-remainder', 0, 1, 1],
  ['arrow', 'arrow-equation', 0, 1, 1],
  ['classic', 'naked-single', 1, 0, 1],
  ['killer', 'cage-distinct', 0, 1, 0],
  ['killer', 'cage-combination', 0, 1, 0],
  ['thermo', 'thermo-bound', 0, 1, 0],
  ['arrow', 'arrow-combination', 0, 1, 0],
].entries()) {
  const [variant, technique, placements, eliminations, variantSteps] = spec
  const counts = Object.fromEntries(
    Object.keys(baseline.workload.techniqueCounts).map((technique) => [technique, 0]),
  )
  counts[technique] = 1
  const summary = {
    ...baseline,
    variant,
    difficulty: engine.TECHNIQUE_TIERS[technique],
    workload: {
      ...baseline.workload,
      placements,
      eliminations,
      candidateRemovals: eliminations,
      variantSteps,
      highestTechnique: technique,
      highestTier: engine.TECHNIQUE_TIERS[technique],
      techniqueCounts: counts,
    },
  }
  add(`action:${index}`, 'summary', summary)
  add(`action-decode:${index}`, 'decode', { status: 'rated', summary }, true, {
    variant,
    difficulty: summary.difficulty,
  })
}
for (const [index, change] of [
  { steps: 82, placements: 82, eliminations: 0, candidateRemovals: 0, technique: 'naked-single' },
  { steps: 501, placements: 0, eliminations: 501, candidateRemovals: 501, technique: 'naked-pair' },
  { steps: 1, placements: 0, eliminations: 1, candidateRemovals: 730, technique: 'naked-pair' },
].entries()) {
  const counts = Object.fromEntries(
    Object.keys(baseline.workload.techniqueCounts).map((technique) => [technique, 0]),
  )
  counts[change.technique] = change.steps
  add(`finite:${index}`, 'summary', {
    ...baseline,
    difficulty: engine.TECHNIQUE_TIERS[change.technique],
    workload: {
      ...baseline.workload,
      ...change,
      highestTechnique: change.technique,
      highestTier: engine.TECHNIQUE_TIERS[change.technique],
      techniqueCounts: counts,
    },
  })
}
for (const [index, value] of [
  { status: 'rated', summary: baseline },
  { status: 'ungraded', ratingVersion: 'sudoku-rating-v2', variant: 'classic' },
  {
    status: 'budget-exhausted',
    ratingVersion: 'sudoku-rating-v2',
    variant: 'classic',
    stage: 'validation',
    difficulty: null,
  },
  {
    status: 'budget-exhausted',
    ratingVersion: 'sudoku-rating-v2',
    variant: 'classic',
    stage: 'logic',
    difficulty: 'medium',
  },
  { status: 'invalid', issues: ['Known conflicting givens'] },
  { status: 'invalid', issues: [] },
  { status: 'invalid', issues: [' '] },
  {
    status: 'budget-exhausted',
    ratingVersion: 'sudoku-rating-v2',
    variant: 'classic',
    stage: 'logic',
    difficulty: null,
  },
  {
    status: 'budget-exhausted',
    ratingVersion: 'sudoku-rating-v2',
    variant: 'arrow',
    stage: 'logic',
    difficulty: 'expert',
  },
  {
    status: 'budget-exhausted',
    ratingVersion: 'sudoku-rating-v2',
    variant: 'classic',
    stage: 'validation',
    difficulty: 'easy',
  },
  null,
  { status: 'unknown' },
].entries())
  add(`outcome:${index}`, 'outcome', value)
add('absent', 'decode', undefined, false)
add('null', 'decode', null)
add('rated', 'decode', { status: 'rated', summary: baseline })
add('old-version', 'decode', {
  status: 'rated',
  summary: { ...baseline, ratingVersion: 'sudoku-rating-v1' },
})
add('missing-version', 'decode', { status: 'rated', summary: { workload: null } })
add('different-difficulty', 'decode', { status: 'rated', summary: baseline }, true, {
  ...identity,
  difficulty: 'medium',
})
add('different-variant', 'decode', { status: 'rated', summary: baseline }, true, {
  variant: 'arrow',
  difficulty: 'easy',
})
add('non-rated', 'decode', {
  status: 'ungraded',
  ratingVersion: 'sudoku-rating-v2',
  variant: 'classic',
})
for (const reason of [
  'ungraded',
  'budget-exhausted',
  'invalid-input',
  'invalid-summary',
  'unsupported-version',
  'identity-mismatch',
  'unknown',
])
  add(`unavailable:${reason}`, 'decode', { status: 'unavailable', reason, issues: [] })
add('bad-unavailable-issues', 'decode', {
  status: 'unavailable',
  reason: 'ungraded',
  issues: [' '],
})
writeFileSync(
  resolve(fixtureRoot, 'assessment-metadata.json'),
  JSON.stringify(rows, null, 2) + '\n',
)
console.log(`Captured ${rows.length} summary and optional-metadata probes`)
