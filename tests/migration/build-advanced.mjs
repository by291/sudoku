import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { referenceRoot } from './freeze-reference.mjs'
import { loadEngine } from './reference-loader.mjs'
import { fixtureRoot } from './suites.mjs'

const engine = await loadEngine({ v11: true })
const { findAdvancedStep } = await import(
  pathToFileURL(resolve(referenceRoot, 'src/core/sudoku/logic/advancedTechniques.ts')).href
)
const { validateAdvancedStep } = await import(
  pathToFileURL(resolve(referenceRoot, 'src/core/sudoku/logic/advancedEvidence.ts')).href
)
const specifications = [
  [
    'naked-triple',
    'naked-triple',
    511,
    [
      [0, 3],
      [1, 6],
      [2, 5],
    ],
  ],
  [
    'hidden-triple',
    'hidden-triple',
    504,
    [
      [0, 11],
      [1, 14],
      [2, 13],
    ],
  ],
  [
    'x-wing',
    'x-wing',
    510,
    [
      [1, 511],
      [6, 511],
      [28, 511],
      [33, 511],
      [10, 511],
    ],
  ],
  [
    'swordfish',
    'swordfish',
    510,
    [
      [1, 511],
      [4, 511],
      [31, 511],
      [34, 511],
      [55, 511],
      [61, 511],
      [10, 511],
    ],
  ],
  [
    'xy-wing',
    'xy-wing',
    511,
    [
      [0, 3],
      [4, 5],
      [27, 6],
    ],
  ],
  [
    'color-trap',
    'simple-coloring',
    510,
    [
      [0, 511],
      [4, 511],
      [40, 511],
      [36, 511],
      [9, 511],
      [18, 511],
    ],
  ],
  [
    'color-wrap',
    'simple-coloring',
    510,
    [
      [0, 511],
      [1, 511],
      [10, 511],
    ],
  ],
  [
    'false-fish',
    'x-wing',
    510,
    [
      [1, 511],
      [6, 511],
      [28, 511],
      [33, 511],
      [35, 511],
      [10, 511],
    ],
  ],
  [
    'false-wing',
    'xy-wing',
    511,
    [
      [0, 3],
      [4, 5],
      [30, 6],
    ],
  ],
  [
    'odd-cycle',
    'simple-coloring',
    510,
    [
      [0, 511],
      [4, 511],
      [40, 511],
      [37, 511],
      [10, 511],
    ],
  ],
  [
    'two-color-conflict',
    'simple-coloring',
    510,
    [
      [0, 511],
      [1, 511],
      [9, 511],
      [10, 511],
    ],
  ],
  [
    'triple-near-miss',
    'naked-triple',
    511,
    [
      [0, 3],
      [4, 6],
      [8, 9],
    ],
  ],
  [
    'hidden-near-miss',
    'hidden-triple',
    511,
    [...Array.from({ length: 9 }, (_, cell) => [cell, 504]), [0, 11], [4, 14], [8, 13], [3, 505]],
  ],
  [
    'triple-no-op',
    'naked-triple',
    511,
    [[0, 3], [4, 6], [8, 5], ...[1, 2, 3, 5, 6, 7].map((cell) => [cell, 504])],
  ],
  [
    'hidden-no-op',
    'hidden-triple',
    511,
    [[0, 3], [4, 6], [8, 5], ...[1, 2, 3, 5, 6, 7].map((cell) => [cell, 504])],
  ],
  [
    'wing-no-op',
    'xy-wing',
    511,
    [
      [0, 3],
      [4, 5],
      [27, 6],
      [31, 507],
    ],
  ],
  [
    'four-cover-fish',
    'swordfish',
    511,
    [
      ...[0, 3, 6].flatMap((row) =>
        Array.from({ length: 9 }, (_, column) => [row * 9 + column, 510]),
      ),
      ...[1, 4, 31, 34, 55, 61, 60].map((cell) => [cell, 511]),
    ],
  ],
]
const rows = []
for (const [id, technique, base, entries] of specifications) {
  const domains = Array(81).fill(base)
  for (const [cell, bits] of entries) domains[cell] = bits
  const input = {
    board: Array(81).fill(0),
    rules: { kind: 'classic' },
    domains,
    technique,
    limit: 100000,
  }
  const compute = (input) => {
    const state = engine.createLogicalWorkspace(input.board, engine.compileRules(input.rules))
    state.candidates = [...input.domains]
    const budget = engine.createWorkBudget(input.limit)
    const result = findAdvancedStep(state, input.technique, budget)
    const valid =
      result.status === 'complete' && result.step ? validateAdvancedStep(state, result.step) : null
    return { result, valid, workUsed: budget.used }
  }
  const complete = compute(input)
  assert.equal(complete.result.status, 'complete')
  for (const limit of new Set([
    0,
    1,
    Math.max(0, complete.workUsed - 1),
    complete.workUsed,
    100000,
  ])) {
    const request = { ...input, limit }
    rows.push({ id: `${id}:${limit}`, input: request, expected: compute(request) })
  }
}
writeFileSync(resolve(fixtureRoot, 'advanced.json'), JSON.stringify(rows, null, 2) + '\n')

const authored = JSON.parse(readFileSync(resolve(fixtureRoot, 'logic.json'), 'utf8'))
const chains = []
for (const row of authored) {
  let board = [...row.input.board]
  let foundChain = false
  let foundAdvanced = false
  for (const [index, step] of row.expected.steps.entries()) {
    if (step.kind !== 'placement') continue
    const budget = engine.createWorkBudget(4000000)
    const hint = engine.analyzeHint(board, row.input.solution, 500, {
      context: engine.compileRules(row.input.rules),
      workBudget: budget,
    })
    if (hint.kind === 'deduction' && hint.steps.length > 1) {
      const advanced = hint.steps.some((step) => engine.isAdvancedTechnique(step.technique))
      if (!foundChain || (advanced && !foundAdvanced)) {
        foundChain = true
        foundAdvanced ||= advanced
        const input = { ...row.input, board: [...board], maxSteps: 500 }
        const compute = (input) => {
          const budget = engine.createWorkBudget(input.limit)
          const result = engine.analyzeHint(input.board, input.solution, input.maxSteps, {
            context: engine.compileRules(input.rules),
            workBudget: budget,
          })
          if (result.kind === 'deduction') {
            for (const step of result.steps) {
              if (step.kind === 'placement') assert.equal(step.digit, input.solution[step.cell])
              else
                for (const removal of step.removals)
                  assert.notEqual(removal.digit, input.solution[removal.cell])
            }
          }
          return { ...result, workUsed: budget.used }
        }
        for (const [limit, maxSteps] of [
          [4000000, 500],
          [budget.used, 500],
          [Math.max(0, budget.used - 1), 500],
          [0, 500],
          [4000000, hint.steps.length - 1],
        ]) {
          const request = { ...input, limit, maxSteps }
          chains.push({
            id: `${row.id}:${index}:${limit}:${maxSteps}`,
            input: request,
            expected: compute(request),
          })
        }
      }
    }
    board[step.cell] = step.digit
  }
}
assert.ok(
  chains.some((row) =>
    row.expected.steps?.some((step) => engine.isAdvancedTechnique(step.technique)),
  ),
)
assert.ok(
  chains.some((row) =>
    row.expected.steps?.some((step) => ['cage', 'thermo', 'arrow'].includes(step.evidence.kind)),
  ),
)
writeFileSync(resolve(fixtureRoot, 'hint-chains.json'), JSON.stringify(chains, null, 2) + '\n')
console.log(`Captured ${rows.length} advanced work probes and ${chains.length} hint-chain probes`)
