import assert from 'node:assert/strict'
import { engine, prepare, root } from './engine.mjs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export async function createCorpus() {
  const { RATING_FIXTURES } = await import(
    pathToFileURL(resolve(root, 'tests/fixtures/rating.ts')).href
  )
  const { referenceCountSolutions } = await import(
    pathToFileURL(resolve(root, 'tests/support/referenceVariants.ts')).href
  )
  const fixtures = await import(pathToFileURL(resolve(root, 'tests/fixtures/sudoku.ts')).href)
  const { VARIANT_FIXTURES } = await import(
    pathToFileURL(resolve(root, 'tests/fixtures/variants.ts')).href
  )
  const cases = []

  function add(id, board, rules, benchmark, knownSolution) {
    const computation = prepare(rules)
    const validator = engine.prepareExactValidator(computation)
    const nodeLimit = 1_000_000
    const workLimit = 4_000_000
    const count = (nodes, work, initialWork = 0) => {
      const budget = engine.createWorkBudget(work)
      budget.used = initialWork
      return validator.count(board, budget, nodes)
    }
    const expected = count(nodeLimit, workLimit)
    assert.equal(expected.status, 'complete', id)
    const independent = referenceCountSolutions(board, rules)
    assert.equal(expected.count, independent.count, id)
    if (knownSolution) {
      assert.equal(independent.count, 1, id)
      assert.deepEqual(expected.solution, knownSolution, id)
      assert.deepEqual(independent.solution, knownSolution, id)
    }
    const limits = [
      [nodeLimit, workLimit, 0],
      [0, workLimit, 0],
      [nodeLimit, 0, 0],
      [1, workLimit, 0],
      [nodeLimit, Math.max(0, expected.workUsed - 1), 0],
      [nodeLimit, Math.max(5, expected.workUsed + 4), 5],
    ]
    cases.push({
      id,
      variant: rules.kind,
      benchmark,
      board: [...board],
      rules,
      topology: {
        units: computation.context.units.map((unit) => [...unit.cells]),
        duplicatePeers: computation.context.duplicatePeers,
        constraints: computation.context.constraints.map((constraint) => ({
          kind: constraint.kind,
          cells: engine.constraintCells(constraint),
          sum: constraint.kind === 'cage' ? constraint.sum : 0,
        })),
      },
      expectedCandidates: engine.calculateBaseCandidates(board, computation.context),
      probes: limits.map(([nodes, work, initialWork]) => ({
        nodeLimit: nodes,
        workLimit: work,
        initialWork,
        expected: count(nodes, work, initialWork),
      })),
    })
  }

  for (const fixture of RATING_FIXTURES) {
    add(`authored:${fixture.id}`, fixture.board, fixture.rules, true, fixture.solution)
    for (let seed = 0; seed < 8; seed++) {
      const input = engine.createGenerationInput(
        fixture.rules.kind,
        fixture.difficulty,
        `rust-core-benchmark-v1:${seed.toString().padStart(3, '0')}`,
      )
      const result = engine.generatePuzzle(input)
      assert.equal(result.status, 'ready', JSON.stringify(input))
      add(
        `generated:${fixture.id}:${seed}`,
        result.puzzle.givens,
        result.puzzle.rules,
        true,
        result.puzzle.solution,
      )
    }
  }

  for (const [name, board] of Object.entries(fixtures)) {
    if (Array.isArray(board)) {
      add(`contract:${name}`, board, { kind: 'classic' }, false)
    }
  }
  for (const [variant, fixture] of Object.entries(VARIANT_FIXTURES)) {
    add(`contract:${variant}:one-hole`, fixture.givens, fixture.rules, false, fixture.solution)
  }

  const largeCages = {
    kind: 'killer',
    cages: Array.from({ length: 9 }, (_, row) => ({
      cells: Array.from({ length: 9 }, (_, column) => row * 9 + column),
      sum: 45,
    })),
  }
  add('contract:large-cage-fallback', fixtures.solvedBoard, largeCages, false, fixtures.solvedBoard)

  // Removing givens widens domains and exercises reversible branching beyond delivered puzzles.
  for (const original of cases.filter((entry) => entry.benchmark).filter((_, i) => i % 9 === 0)) {
    const removed = original.board.map((digit, cell) => (cell % 4 === 0 ? 0 : digit))
    add(`contract:removed:${original.id}`, removed, original.rules, false)
    const contradictory = [...original.board]
    const filled = contradictory.findIndex((digit) => digit !== 0)
    const peer = original.topology.duplicatePeers[filled][0]
    contradictory[peer] = contradictory[filled]
    add(`contract:duplicate:${original.id}`, contradictory, original.rules, false)
  }
  return cases
}
