import { computeScreening } from './reference-assessment.mjs'
import assert from 'node:assert/strict'
import { nativeResults } from './native-adapter.mjs'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadEngine } from './reference-loader.mjs'
import { referenceRoot, sha256 } from './freeze-reference.mjs'

export const fixtureRoot = fileURLToPath(new URL('../fixtures/engine-contracts/', import.meta.url))
const plain = (value) => JSON.parse(JSON.stringify(value))

export async function computeCase(engine, suite, input) {
  const budget = engine.createWorkBudget(input.limit ?? 4000000)
  let result
  switch (suite) {
    case 'rules': {
      const context = engine.compileRules(input.rules)
      result = {
        context,
        candidates: engine.calculateBaseCandidates(input.board, context),
        complete: engine.isComplete(input.board, context),
      }
      break
    }
    case 'constraints': {
      const context = engine.compileRules(input.rules)
      const candidateBudget = engine.createWorkBudget(input.limit)
      result = {
        candidates: engine.evaluateCandidates(input.board, context, candidateBudget),
        candidateWork: candidateBudget.used,
        conflicts: engine.evaluateConflicts(input.board, context, budget),
      }
      break
    }
    case 'support': {
      const { prepareConstraintSupport } = await import(
        pathToFileURL(resolve(referenceRoot, 'src/core/sudoku/constraints/support.ts')).href
      )
      const context = engine.compileRules(input.rules)
      const preparation = engine.createWorkBudget(input.prepareLimit)
      const prepared = prepareConstraintSupport(context, preparation, input.limits)
      assert.equal(prepared.status, 'ready')
      const query = engine.createWorkBudget(input.queryLimit)
      result = {
        result: prepared.support.get(
          input.board,
          input.domains,
          context.constraints[input.index],
          query,
        ),
        prepareWork: preparation.used,
        queryWork: query.used,
      }
      break
    }
    case 'exact':
      result = engine.countSolutions(input.board, {
        maxSolutions: 2,
        nodeBudget: input.nodes,
        context: engine.compileRules(input.rules),
        workBudget: budget,
      })
      break
    case 'exact-prepared': {
      const setup = engine.createWorkBudget(4000000)
      const prepared = engine.prepareRuleComputation(input.rules, setup)
      assert.equal(prepared.status, 'ready')
      const query = engine.createWorkBudget(input.workLimit)
      query.used = input.initialWork
      const result = engine
        .prepareExactValidator(prepared.computation)
        .count(input.board, query, input.nodeLimit)
      return plain({ result, used: query.used })
    }
    case 'logic-basic':
    case 'logic':
      result = engine.analyzeLogic(
        input.board,
        input.rules.kind === 'classic'
          ? engine.ALL_CLASSIC_TECHNIQUES
          : engine.RATING_POLICIES[input.rules.kind].hard,
        500,
        {
          context: engine.compileRules(input.rules),
          workBudget: budget,
        },
      )
      break
    case 'advanced': {
      const moduleUrl = (name) =>
        pathToFileURL(resolve(referenceRoot, 'src/core/sudoku/logic', name + '.ts')).href
      const { findAdvancedStep } = await import(moduleUrl('advancedTechniques'))
      const { validateAdvancedStep } = await import(moduleUrl('advancedEvidence'))
      const state = engine.createLogicalWorkspace(input.board, engine.compileRules(input.rules))
      state.candidates = [...input.domains]
      const step = findAdvancedStep(state, input.technique, budget)
      result = {
        result: step,
        valid:
          step.status === 'complete' && step.step ? validateAdvancedStep(state, step.step) : null,
      }
      break
    }
    case 'hint-chains':
    case 'hints':
      result = engine.analyzeHint(input.board, input.solution, input.maxSteps ?? 500, {
        context: engine.compileRules(input.rules),
        workBudget: budget,
      })
      break
    case 'assessment-metadata': {
      if (input.operation === 'summary') return plain(engine.parseAssessmentSummary(input.value))
      if (input.operation === 'outcome') return plain(engine.parseAssessmentOutcome(input.value))
      const decoded = engine.decodePuzzleAssessment(
        input.present ? input.value : undefined,
        input.identity,
      )
      return decoded === undefined ? { present: false } : plain({ present: true, value: decoded })
    }
    case 'assessment-screening':
      return computeScreening(engine, input)
    case 'assessment-generated':
    case 'assessment': {
      const request = engine.createAssessmentInput(input.board, input.rules)
      result = {
        result: engine.assessPuzzle(request),
        budgeted: engine.assessPuzzleWithBudget(request, budget),
      }
      break
    }
    case 'validation':
      result = engine.parsePuzzle(input.puzzle)
      break
    case 'editing': {
      const session = await import(
        pathToFileURL(resolve(referenceRoot, 'src/features/game/model/session.ts')).href
      )
      const before = session.createSession(
        input.puzzle,
        { kind: 'free' },
        'migration',
        '2026-10-16T00:00:00.000Z',
      )
      const edit = session.applySessionAction(before, input.action, budget)
      result = {
        status: edit.status,
        entries: edit.session.entries,
        notes: edit.session.notes,
        changed: edit.changed,
        boardComplete: edit.boardComplete,
      }
      break
    }
    case 'generation': {
      const seedHex = Buffer.from(input.seed).toString('hex')
      const request = engine.createGenerationInput(input.variant, input.difficulty, seedHex)
      assert.equal(request.puzzleVersion, input.puzzleVersion)
      result = { result: engine.generatePuzzle(request) }
      if (result.result.status === 'ready') {
        const puzzle = result.result.puzzle
        const request = engine.createAssessmentInput(puzzle.givens, puzzle.rules)
        result.assessment = {
          result: engine.assessPuzzle(request),
          budgeted: engine.assessPuzzleWithBudget(request, budget),
        }
      }
      break
    }
    default:
      throw new Error(`Unsupported migration suite: ${suite}`)
  }
  return plain({
    ...result,
    ...(['generation', 'support'].includes(suite) ? {} : { workUsed: budget.used }),
  })
}

export async function runMigration(args) {
  const option = (name, fallback) => {
    const index = args.indexOf(name)
    return index < 0 ? fallback : args[index + 1]
  }
  const suite = option('--suite', 'all')
  const selectedEngine = option('--engine', 'typescript')
  assert.ok(['typescript', 'native'].includes(selectedEngine), 'Engine adapter not implemented yet')
  const manifest = JSON.parse(readFileSync(resolve(fixtureRoot, 'manifest.json'), 'utf8'))
  for (const patch of manifest.patch) {
    assert.equal(
      sha256(readFileSync(new URL(patch.file, import.meta.url))),
      patch.sha256,
      `Changed v11 reference patch: ${patch.file}`,
    )
  }
  for (const fixture of manifest.fixtures) {
    const stored = readFileSync(resolve(fixtureRoot, fixture.file))
    const bytes = fixture.file.endsWith('.gz') ? gunzipSync(stored) : stored
    assert.equal(sha256(bytes), fixture.sha256, `Changed fixture: ${fixture.file}`)
  }
  const engine = selectedEngine === 'typescript' ? await loadEngine({ v11: true }) : null
  const suites =
    suite === 'all'
      ? [
          'rules',
          'constraints',
          'support',
          'exact',
          'exact-prepared',
          'advanced',
          'logic',
          'hints',
          'hint-chains',
          'assessment',
          'assessment-screening',
          'assessment-metadata',
          'editing',
          'validation',
          'generation',
        ]
      : [suite]
  let checked = 0
  for (const name of suites) {
    let files
    if (name === 'generation' || name === 'assessment-generated') {
      files = ['full', 'targeted', 'feedback', 'hard058'].map(
        (family) => `generation-v11-${family}.jsonl.gz`,
      )
    } else if (name === 'assessment-screening') {
      files = ['assessment-screening.jsonl.gz']
    } else {
      files = [(name === 'logic-basic' ? 'logic' : name) + '.json']
    }
    let rows = files.flatMap((file) => {
      const stored = readFileSync(resolve(fixtureRoot, file))
      if (file.endsWith('.gz'))
        return gunzipSync(stored)
          .toString('utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      return JSON.parse(stored.toString('utf8'))
    })
    if (name === 'assessment-generated') {
      const counts = new Map(
        JSON.parse(
          readFileSync(resolve(fixtureRoot, 'generated-assessment-work.json'), 'utf8'),
        ).map((row) => [row.id, row.workUsed]),
      )
      rows = rows.map((row) => {
        assert.equal(row.expected.result.status, 'ready')
        const puzzle = row.expected.result.puzzle
        return {
          id: row.id,
          input: {
            board: puzzle.givens,
            solution: puzzle.solution,
            rules: puzzle.rules,
            difficulty: puzzle.difficulty,
            limit: 4000000,
          },
          expected: { ...row.expected.assessment, workUsed: counts.get(row.id) },
        }
      })
    }
    if (name === 'logic-basic') {
      rows = rows.filter((row) =>
        row.expected.steps.every(
          (step) =>
            ![
              'naked-triple',
              'hidden-triple',
              'x-wing',
              'swordfish',
              'xy-wing',
              'simple-coloring',
            ].includes(step.technique),
        ),
      )
    }
    const batchSize = 128
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize)
      const native = selectedEngine === 'native' ? nativeResults(name, batch) : null
      for (const [index, row] of batch.entries()) {
        assert.deepStrictEqual(
          native ? native[index] : await computeCase(engine, name, row.input),
          row.expected,
          `Migration result mismatch: ${name}/${row.id}`,
        )
        checked++
      }
      if (rows.length > batchSize)
        console.log(
          `${selectedEngine} ${name}: ${Math.min(start + batchSize, rows.length)}/${rows.length}`,
        )
    }
    console.log(`${selectedEngine} ${name}: ${rows.length} PASS`)
  }
  console.log(`Migration contracts: ${checked} PASS`)
}
