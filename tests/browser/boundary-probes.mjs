// Real-binding boundary probes; algorithm correctness is covered by the Rust tests.
import { createBindings } from '/sudoku/wasm/pkg/factory.js'

const wasm = createBindings()
const init = wasm.default
await init()

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
  const missing = globalThis.structuredClone(empty)
  delete missing.workload.highestTier
  const bigint = globalThis.structuredClone(empty)
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
