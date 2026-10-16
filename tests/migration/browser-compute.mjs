// Test-only transport projection. Every mathematical operation runs in the emitted WASM.
import { createBindings } from '/packages/sudoku-wasm/pkg/factory.js'

const wasm = createBindings()
const init = wasm.default
await init()

export function computeCase(suite, input, policies) {
  const limit = input.limit ?? 4000000
  const prepare = (rules) => new wasm.PreparedPuzzle({ rules, maxWork: 4000000 })
  const assessment = (board, rules) => ({
    result: wasm.assess({ board, rules }).result,
    budgeted: wasm.assess({ board, rules, maxWork: limit }).result,
  })
  switch (suite) {
    case 'rules': {
      const prepared = prepare(input.rules)
      try {
        return {
          context: prepared.metadata(),
          candidates: Array.from(prepared.base_candidates(input.board)),
          complete: prepared.is_complete(input.board),
          workUsed: 0,
        }
      } finally {
        prepared.free()
      }
    }
    case 'constraints': {
      const prepared = prepare(input.rules)
      try {
        const query = { board: input.board, work: { maxWork: limit } }
        const candidates = prepared.candidates(query)
        const conflicts = prepared.conflicts(query)
        return {
          candidates: candidates.result,
          candidateWork: candidates.workUsed,
          conflicts: conflicts.result,
          workUsed: conflicts.workUsed,
        }
      } finally {
        prepared.free()
      }
    }
    case 'exact': {
      const counted = wasm.count_solutions({
        board: input.board,
        rules: input.rules,
        work: { maxWork: limit, nodeLimit: input.nodes },
      })
      return { ...counted.result, workUsed: counted.workUsed }
    }
    case 'exact-prepared': {
      const prepared = prepare(input.rules)
      try {
        const result = prepared.count_solutions({
          board: input.board,
          work: {
            maxWork: input.workLimit,
            initialWork: input.initialWork,
            nodeLimit: input.nodeLimit,
          },
        })
        return { result: result.result, used: result.workUsed }
      } finally {
        prepared.free()
      }
    }
    case 'logic': {
      const output = wasm.analyze_logic({
        board: input.board,
        rules: input.rules,
        allowed: policies[input.rules.kind],
        maxSteps: 500,
        maxWork: limit,
      })
      return { ...output.result, workUsed: output.workUsed }
    }
    case 'hints':
    case 'hint-chains': {
      const output = wasm.hint({
        board: input.board,
        solution: input.solution,
        rules: input.rules,
        maxSteps: input.maxSteps ?? 500,
        maxWork: limit,
      })
      const validated = wasm.validate_hint_evidence({
        hint: output.result,
        rules: input.rules,
        board: input.board,
      })
      if (
        validated.status !== 'valid' ||
        JSON.stringify(validated.hint) !== JSON.stringify(output.result)
      ) {
        throw new Error('WASM hint evidence failed its independent proof validator')
      }
      return { ...output.result, workUsed: output.workUsed }
    }
    case 'assessment': {
      const budgeted = wasm.assess({ board: input.board, rules: input.rules, maxWork: limit })
      return {
        result: wasm.assess({ board: input.board, rules: input.rules }).result,
        budgeted: budgeted.result,
        workUsed: budgeted.workUsed,
      }
    }
    case 'assessment-metadata': {
      if (input.operation === 'summary') {
        return wasm.parse_assessment_summary(input.value)
      }
      if (input.operation === 'outcome') {
        return wasm.parse_assessment_outcome(input.value)
      }
      const result = wasm.validate_assessment({
        present: input.present,
        value: input.value,
        identity: input.identity,
      })
      return result.status === 'absent'
        ? { present: false }
        : { present: true, value: result.value }
    }
    case 'validation': {
      const puzzle = input.puzzle
      if (
        !['easy', 'medium', 'hard', 'expert'].includes(puzzle.difficulty) ||
        typeof puzzle.seed !== 'string' ||
        !puzzle.seed.length ||
        typeof puzzle.puzzleVersion !== 'string' ||
        !puzzle.puzzleVersion.length
      ) {
        return { valid: false, issues: ['Invalid puzzle metadata'], workUsed: 0 }
      }
      const { givens, solution, difficulty, rules } = puzzle
      const result = wasm.validate_puzzle({ givens, solution, difficulty, rules })
      if (result.status === 'budget-exhausted') {
        throw new Error('Stored content validation was inconclusive')
      }
      return result.status === 'valid'
        ? {
            valid: true,
            value: {
              givens,
              solution,
              difficulty,
              rules,
              seed: puzzle.seed,
              puzzleVersion: puzzle.puzzleVersion,
            },
            workUsed: 0,
          }
        : { valid: false, issues: result.issues, workUsed: 0 }
    }
    case 'editing': {
      const prepared = prepare(input.puzzle.rules)
      try {
        const edited = prepared.edit({
          givens: input.puzzle.givens,
          entries: Array(81).fill(0),
          notes: Array(81).fill(0),
          action:
            input.action.kind === 'erase'
              ? { kind: 'erase', cell: input.action.cell }
              : input.action.kind === 'generate-notes'
                ? { kind: 'generate-notes' }
                : input.action,
          work: { maxWork: limit },
        })
        const result = edited.result
        if (result.status === 'budget-exhausted') {
          return {
            status: result.status,
            entries: Array(81).fill(0),
            notes: Array(81).fill(0),
            changed: false,
            boardComplete: false,
            workUsed: edited.workUsed,
          }
        }
        // Session assistance/history owns these two facts; the core reports board-layer changes.
        const changed = result.changed || input.action.kind === 'generate-notes'
        return {
          ...result,
          changed,
          boardComplete: changed && result.boardComplete,
          workUsed: edited.workUsed,
        }
      } finally {
        prepared.free()
      }
    }
    case 'generation':
    case 'generation-boundaries': {
      const result = wasm.generate(new Uint8Array(input.seed), {
        variant: input.variant,
        difficulty: input.difficulty,
        puzzleVersion: input.puzzleVersion,
        limits: input.limits,
      })
      return result.status === 'ready'
        ? { result, assessment: assessment(result.puzzle.givens, result.puzzle.rules) }
        : { result }
    }
    default:
      throw new Error(`No WASM contract projection: ${suite}`)
  }
}

export async function boundaryProbes() {
  const { memory } = await init()
  const prepared = prepareOwnedLayout()
  const arrays = prepared.metadata()
  const candidates = prepared.candidates({ board: Array(81).fill(0) })
  prepared.free()
  const empty = {
    ratingVersion: 'sudoku-rating-v2',
    variant: 'classic',
    difficulty: 'easy',
    workload: {
      steps: 0,
      placements: 0,
      eliminations: 0,
      candidateRemovals: 0,
      variantSteps: 0,
      highestTechnique: null,
      highestTier: null,
      techniqueCounts: Object.fromEntries(
        [
          'naked-single',
          'hidden-single',
          'locked-candidate',
          'naked-pair',
          'hidden-pair',
          'naked-triple',
          'hidden-triple',
          'x-wing',
          'swordfish',
          'xy-wing',
          'simple-coloring',
          'cage-distinct',
          'cage-remainder',
          'cage-combination',
          'thermo-bound',
          'arrow-equation',
          'arrow-combination',
        ].map((name) => [name, 0]),
      ),
    },
  }
  const missing = structuredClone(empty)
  delete missing.workload.highestTier
  const bigint = structuredClone(empty)
  bigint.workload.steps = 0n
  const unsupported = {
    status: 'rated',
    summary: { ratingVersion: 'old', workload: { steps: 0n } },
  }
  const malformedBoards = [
    Array(80).fill(0),
    Array(81).fill(0.5),
    Array(81).fill(NaN),
    Array(81).fill(256),
    Array(81).fill('0'),
  ]
  const rejected = malformedBoards.map((board) => {
    try {
      wasm.count_solutions({ board, rules: { kind: 'classic' } })
      return false
    } catch {
      return true
    }
  })
  const badInput = {
    rules: { kind: 'thermo', paths: [Array.from({ length: 2000 }, (_, i) => i)] },
  }
  let rejectedLayouts = 0
  for (let i = 0; i < 200; i++) {
    try {
      const resource = new wasm.PreparedPuzzle(badInput)
      resource.free()
    } catch {
      rejectedLayouts++
    }
  }
  const before = memory.buffer.byteLength
  for (let i = 0; i < 2000; i++) {
    try {
      const resource = new wasm.PreparedPuzzle(badInput)
      resource.free()
    } catch {
      rejectedLayouts++
    }
  }
  const after = memory.buffer.byteLength
  let arrowComplementRejected = false
  try {
    wasm.transform_rules({
      rules: { kind: 'arrow', arrows: [{ circle: 0, shaft: [1, 2] }] },
      symmetry: 0,
      complement: true,
    })
  } catch {
    arrowComplementRejected = true
  }
  return {
    thermoComplement: wasm.transform_rules({
      rules: { kind: 'thermo', paths: [[0, 1, 2]] },
      symmetry: 0,
      complement: true,
    }),
    arrowComplementRejected,
    plainArrays:
      Array.isArray(arrays.units) &&
      Array.isArray(arrays.units[0].cells) &&
      Array.isArray(candidates.result.candidates),
    ownership: arrays.rules.paths[0][0] === 0,
    validNull: wasm.parse_assessment_summary(empty),
    missing: wasm.parse_assessment_summary(missing),
    bigint: wasm.parse_assessment_summary(bigint),
    absent: wasm.validate_assessment({
      present: false,
      value: undefined,
      identity: { variant: 'classic', difficulty: 'easy' },
    }),
    unsupported: wasm.validate_assessment({
      present: true,
      value: unsupported,
      identity: { variant: 'classic', difficulty: 'easy' },
    }),
    rejected,
    before,
    after,
    rejectedLayouts,
  }
}

function prepareOwnedLayout() {
  const rules = { kind: 'thermo', paths: [[0, 1, 2]] }
  const prepared = new wasm.PreparedPuzzle({ rules })
  rules.paths[0][0] = 80
  return prepared
}
