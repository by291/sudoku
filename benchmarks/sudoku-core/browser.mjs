import { createBindings } from '/packages/sudoku-wasm/pkg/factory.js'
import { createMainEngine } from '/src/sudoku/mainEngine.ts'
import { createSudokuWorkerClient } from '/src/worker/client.ts'
import { commitBoardEdit } from '/src/features/game/model/session.ts'
import { profileLiveOperations } from '/tests/migration/live-profile.ts'
import { prepareRuleComputation } from '@reference/core/sudoku/constraints/computation'
import { prepareExactValidator } from '@reference/core/sudoku/search/exact'
import { createWorkBudget } from '@reference/core/sudoku/budget'
import { createGenerationInput } from '@reference/core/sudoku/generation/input'
import { generatePuzzle } from '@reference/core/sudoku/generation/generate'
import { deriveSeed, phaseRandom } from '/tests/migration/v11-random.ts'
import { verifyPayload, verifyThenMeasure, requireEmittedWasm, statistics } from './contracts.mjs'

const clock = () => performance.now()
let bindings
let compiled
let memory
let prepared = []

function options(input) {
  return {
    variant: input.variant,
    difficulty: input.difficulty,
    puzzleVersion: input.puzzleVersion,
    ...(input.limits ? { limits: input.limits } : {}),
  }
}

function referenceRequest(input) {
  const hex = input.seed.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return createGenerationInput(input.variant, input.difficulty, hex)
}

async function initialize(asset, base, kernels) {
  const fetchStarted = clock()
  const response = await fetch(asset, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Missing emitted WASM: ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const fetchMs = clock() - fetchStarted
  requireEmittedWasm(new URL(asset, location.href).pathname, bytes, base)
  const compileStarted = clock()
  compiled = await WebAssembly.compile(bytes)
  const compileMs = clock() - compileStarted
  bindings = createBindings()
  const instantiateStarted = clock()
  const exports = await bindings.default({ module_or_path: compiled })
  const instantiateMs = clock() - instantiateStarted
  memory = exports.memory
  const main = await createMainEngine(compiled)
  main.dispose()
  let wasmPreparationMs = 0
  let typescriptPreparationMs = 0
  prepared = kernels.map((entry) => {
    const first = clock()
    const wasm = new bindings.PreparedPuzzle({ rules: entry.rules, maxWork: 4000000 })
    wasmPreparationMs += clock() - first
    const second = clock()
    const result = prepareRuleComputation(entry.rules, createWorkBudget(4000000))
    if (result.status !== 'ready') throw new Error('Incomplete reference preparation')
    const ts = prepareExactValidator(result.computation)
    typescriptPreparationMs += clock() - second
    // All six budget probes are verified before steady-state timing.
    for (const probe of entry.probes) {
      const budget = createWorkBudget(probe.workLimit)
      budget.used = probe.initialWork
      verifyPayload(ts.count(entry.board, budget, probe.nodeLimit), probe.expected)
      verifyPayload(
        wasm.count_solutions({
          board: entry.board,
          work: {
            maxWork: probe.workLimit,
            initialWork: probe.initialWork,
            nodeLimit: probe.nodeLimit,
          },
        }).result,
        probe.expected,
      )
    }
    return { ...entry, ts, wasm }
  })
  return {
    fetchMs,
    compileMs,
    instantiateMs,
    wasmPreparationMs,
    typescriptPreparationMs,
    memoryBytes: memory.buffer.byteLength,
    info: bindings.engine_info(),
  }
}

function kernelOperation(entry, engine) {
  const probe = entry.probes[0]
  if (engine === 'wasm') {
    return entry.wasm.count_solutions({
      board: entry.board,
      work: {
        maxWork: probe.workLimit,
        initialWork: probe.initialWork,
        nodeLimit: probe.nodeLimit,
      },
    }).result
  }
  const budget = createWorkBudget(probe.workLimit)
  budget.used = probe.initialWork
  return entry.ts.count(entry.board, budget, probe.nodeLimit)
}

function kernels() {
  const result = []
  for (const variant of ['classic', 'diagonal', 'jigsaw', 'killer', 'thermo', 'arrow']) {
    const group = prepared.filter((entry) => entry.rules.kind === variant)
    const repetitions = {}
    const samples = { typescript: [], wasm: [] }
    for (const engine of ['typescript', 'wasm']) {
      const started = clock()
      for (const entry of group) kernelOperation(entry, engine)
      repetitions[engine] = Math.max(
        1,
        Math.min(10000, Math.ceil(150 / Math.max(0.01, clock() - started))),
      )
    }
    for (let pair = 0; pair < 5; pair++) {
      for (const engine of pair % 2 ? ['wasm', 'typescript'] : ['typescript', 'wasm']) {
        const started = clock()
        for (let repeat = 0; repeat < repetitions[engine]; repeat++) {
          for (const entry of group) kernelOperation(entry, engine)
        }
        samples[engine].push((clock() - started) / repetitions[engine])
      }
    }
    result.push({ variant, boards: group.length, repetitions, sweepMs: samples })
  }
  return result
}

function generation(rows) {
  return rows.map((row, index) => {
    const request = referenceRequest(row.input)
    const seed = new Uint8Array(row.input.seed)
    const run = {
      typescript: () => generatePuzzle(request, row.input.limits),
      wasm: () => bindings.generate(seed, options(row.input)),
    }
    const samples = {}
    for (const engine of index % 2 ? ['wasm', 'typescript'] : ['typescript', 'wasm']) {
      samples[engine] = verifyThenMeasure(run[engine], row.expected.result, clock).durationMs
    }
    return {
      id: row.id,
      variant: row.input.variant,
      difficulty: row.input.difficulty,
      ...samples,
      status: row.expected.result.status,
      metrics: row.expected.result.metrics,
    }
  })
}

async function workers(rows, asset, base) {
  const NativeWorker = globalThis.Worker
  const usedAssets = []
  let nextReady = Promise.resolve(true)
  class EmittedWorker extends NativeWorker {
    constructor(_url, settings) {
      if (!new URL(asset, location.href).pathname.startsWith(`${base}assets/sudoku.worker-`))
        throw new Error('Missing emitted production Worker')
      usedAssets.push(asset)
      super(asset, settings)
      nextReady = new Promise((resolve) => {
        this.addEventListener(
          'message',
          (event) => {
            resolve(event.data?.kind === 'ready')
          },
          { once: true },
        )
        this.addEventListener('error', () => resolve(false), { once: true })
      })
    }
  }
  globalThis.Worker = EmittedWorker
  const engine = await createMainEngine(compiled)
  const client = createSudokuWorkerClient(compiled, engine)
  const samples = []
  try {
    for (const row of rows) {
      const condition =
        samples.length === 0 ? 'first-request-awaiting-initialization' : 'ready-idle-worker'
      if (samples.length > 0) {
        const ready = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), 3000)
          nextReady.then((value) => {
            clearTimeout(timer)
            resolve(value)
          })
        })
        if (!ready) throw new Error('Production idle Worker did not become ready')
      }
      const started = clock()
      const outcome = await client.generate({ ...row.input, seed: new Uint8Array(row.input.seed) })
      const durationMs = clock() - started
      if (outcome.status !== 'completed')
        throw new Error(`Production Worker ${row.id}: ${outcome.status}`)
      verifyPayload(outcome.value, row.expected.result.puzzle)
      verifyPayload(outcome.assessment, {
        status: 'rated',
        summary: row.expected.result.assessment,
      })
      samples.push({
        id: row.id,
        variant: row.input.variant,
        difficulty: row.input.difficulty,
        condition,
        durationMs,
      })
    }
    return {
      samples,
      usedAssets,
      statistics: statistics(samples.map((sample) => sample.durationMs)),
    }
  } finally {
    client.dispose()
    engine.dispose()
    globalThis.Worker = NativeWorker
  }
}

async function resources() {
  const beforeBytes = memory.buffer.byteLength
  for (let index = 0; index < 1000; index++) {
    const puzzle = new bindings.PreparedPuzzle({ rules: { kind: 'classic' } })
    puzzle.metadata()
    puzzle.free()
  }
  const warmedBytes = memory.buffer.byteLength
  for (let index = 0; index < 1000; index++) {
    const puzzle = new bindings.PreparedPuzzle({ rules: { kind: 'classic' } })
    puzzle.metadata()
    puzzle.free()
  }
  let disposalMs = 0
  for (let index = 0; index < 20; index++) {
    const started = clock()
    const engine = await createMainEngine(compiled)
    engine.prepare({ kind: 'classic' })
    engine.dispose()
    disposalMs += clock() - started
  }
  return {
    beforeBytes,
    warmedBytes,
    finalBytes: memory.buffer.byteLength,
    stableAllocatorAfterWarmup: memory.buffer.byteLength === warmedBytes,
    repeatedInstantiationDisposalMeanMs: disposalMs / 20,
  }
}

function seedCosts() {
  const material = new Uint8Array(32).fill(7)
  const result = {}
  for (const [engine, operation] of Object.entries({
    typescript: () => deriveSeed(material),
    wasm: () => bindings.derive_seed(material),
  })) {
    verifyPayload(Array.from(operation()), Array.from(deriveSeed(material)))
    const started = clock()
    let checksum = 0
    for (let repeat = 0; repeat < 10000; repeat++) checksum += operation()[0]
    result[engine] = { nsPerDerivation: ((clock() - started) * 1e6) / 10000, checksum }
  }
  const input = {
    seed: material,
    variant: 'classic',
    difficulty: 'easy',
    puzzleVersion: 'sudoku-v11',
  }
  const started = clock()
  let checksum = 0
  for (let repeat = 0; repeat < 1000; repeat++) {
    const random = phaseRandom(input, 'terminal', 0, 0)
    for (let word = 0; word < 256; word++) checksum += random() * 4294967296
  }
  result.typescriptPhaseAnd256Words = { nsPerStream: ((clock() - started) * 1e6) / 1000, checksum }
  return result
}

async function hintReception(rows) {
  const engine = await createMainEngine(compiled)
  const profiles = []
  try {
    for (const row of rows) {
      const hint = Object.fromEntries(
        Object.entries(row.expected).filter(([key]) => key !== 'workUsed'),
      )
      for (const operation of ['hint-parse', 'hint-validation']) {
        const run = () =>
          operation === 'hint-parse'
            ? engine.parseHint(hint)
            : engine.validateHint({
                hint,
                rules: row.input.rules,
                board: row.input.board,
              })
        if (run().status !== 'valid') throw new Error(`Invalid sealed hint ${row.id}`)
        for (let repeat = 0; repeat < 5; repeat++) run()
        const values = []
        for (let repeat = 0; repeat < 40; repeat++) {
          const started = clock()
          run()
          values.push(clock() - started)
        }
        profiles.push({ id: row.id, operation, ...statistics(values) })
      }
    }
    return profiles
  } finally {
    engine.dispose()
  }
}

async function resourceCycles(asset) {
  const NativeWorker = globalThis.Worker
  const active = new Set()
  let workersCreated = 0
  let workersTerminated = 0
  class ObservedWorker extends NativeWorker {
    constructor(_url, settings) {
      super(asset, settings)
      active.add(this)
      workersCreated++
    }
    terminate() {
      if (active.delete(this)) workersTerminated++
      super.terminate()
    }
  }
  globalThis.Worker = ObservedWorker
  try {
    for (let index = 0; index < 20; index++) {
      const engine = await createMainEngine(compiled)
      const client = createSudokuWorkerClient(compiled, engine)
      try {
        engine.prepare({ kind: 'classic' }).metadata()
        const result = await client.conflicts(Array(81).fill(0), { kind: 'classic' })
        if (result.status !== 'completed') throw new Error('Resource lifecycle Worker failed')
      } finally {
        client.dispose()
        engine.dispose()
      }
    }
    return { mainInstances: 20, workersCreated, workersTerminated, activeWorkers: active.size }
  } finally {
    globalThis.Worker = NativeWorker
  }
}

async function interactiveBudgetCases(rows, asset) {
  const engine = await createMainEngine(compiled)
  const profiles = []
  const rawHeavyKernels = []
  const workerComputations = []
  const NativeWorker = globalThis.Worker
  const receiving = []
  const listeners = new WeakMap()
  // Time each actual client receive handler, including decoding, retirement and idle-worker creation.
  class TimedWorker extends NativeWorker {
    constructor(_url, settings) {
      super(asset, settings)
    }
    addEventListener(type, listener, options) {
      if (type !== 'message' || typeof listener !== 'function')
        return super.addEventListener(type, listener, options)
      const timed = (event) => {
        const started = clock()
        listener.call(this, event)
        if (event.data?.requestId) receiving.push(clock() - started)
      }
      listeners.set(listener, timed)
      return super.addEventListener(type, timed, options)
    }
    removeEventListener(type, listener, options) {
      return super.removeEventListener(type, listeners.get(listener) ?? listener, options)
    }
  }
  globalThis.Worker = TimedWorker
  const client = createSudokuWorkerClient(compiled, engine)
  function sample(run, repeats = 40) {
    for (let repeat = 0; repeat < 5; repeat++) run()
    const values = []
    for (let repeat = 0; repeat < repeats; repeat++) {
      const started = clock()
      run()
      values.push(clock() - started)
    }
    return statistics(values)
  }
  try {
    for (const row of rows) {
      const layout = engine.prepare(row.input.rules)
      const raw = new bindings.PreparedPuzzle({ rules: row.input.rules })
      try {
        for (const maxWork of new Set([1000000, row.input.limit])) {
          for (const operation of ['candidates', 'conflicts', 'generate-notes']) {
            const run = () =>
              operation === 'generate-notes'
                ? raw.edit({
                    givens: Array(81).fill(0),
                    entries: row.input.board,
                    notes: Array(81).fill(0),
                    action: { kind: 'generate-notes' },
                    work: { maxWork },
                  })
                : raw[operation]({ board: row.input.board, work: { maxWork } })
            const observation = run()
            const profile = {
              id: row.id,
              variant: row.input.rules.kind,
              operation,
              maxWork,
              status: observation.result.status,
              workUsed: observation.workUsed,
              ...sample(run),
            }
            if (layout.liveExecution === 'worker') rawHeavyKernels.push(profile)
            else profiles.push(profile)
          }
        }
        if (layout.liveExecution !== 'worker') continue
        profiles.push({
          id: row.id,
          operation: 'preview-conflicts',
          ...sample(() => layout.previewConflicts(row.input.board)),
        })
        const input = {
          givens: Array(81).fill(0),
          entries: row.input.board,
          notes: Array(81).fill(0),
          rules: row.input.rules,
        }
        for (const operation of ['conflicts', 'generate-notes']) {
          const expected =
            operation === 'conflicts'
              ? raw.conflicts({ board: row.input.board })
              : raw.edit({
                  givens: input.givens,
                  entries: input.entries,
                  notes: input.notes,
                  action: { kind: 'generate-notes' },
                })
          const posting = []
          const committing = []
          receiving.length = 0
          for (let repeat = 0; repeat < 40; repeat++) {
            const started = clock()
            const pending =
              operation === 'conflicts'
                ? client.conflicts(row.input.board, row.input.rules)
                : client.generateNotes(input)
            posting.push(clock() - started)
            const outcome = await pending
            if (outcome.status !== 'completed')
              throw new Error(`Live Worker ${row.id}: ${outcome.status}`)
            verifyPayload(outcome.value.computation, expected)
            if (outcome.value.preparationWork > 1000000) throw new Error('Excess layout work')
            if (operation === 'generate-notes') {
              const session = {
                entries: input.entries,
                notes: input.notes,
                completion: null,
                undoStack: [],
                redoStack: [],
                assistance: { candidateCount: 0, assisted: false },
              }
              const commitStarted = clock()
              const committed = commitBoardEdit(session, outcome.value.computation.result, {
                kind: 'generate-notes',
              })
              committing.push(clock() - commitStarted)
              if (expected.result.status === 'budget-exhausted' && committed.session !== session)
                throw new Error('Exhausted notes mutated the session')
            }
          }
          profiles.push({ id: row.id, operation: `post-${operation}`, ...statistics(posting) })
          profiles.push({ id: row.id, operation: `receive-${operation}`, ...statistics(receiving) })
          if (committing.length)
            profiles.push({
              id: row.id,
              operation: 'commit-generated-notes',
              status: expected.result.status,
              ...statistics(committing),
            })
          workerComputations.push({
            id: row.id,
            operation,
            maxWork: 1000000,
            status: expected.result.status,
            workUsed: expected.workUsed,
            samples: 40,
          })
        }
      } finally {
        raw.free()
        layout.dispose()
      }
    }
    return { profiles, rawHeavyKernels, workerComputations }
  } finally {
    client.dispose()
    engine.dispose()
    globalThis.Worker = NativeWorker
  }
}

globalThis.sudokuReleaseAudit = {
  initialize,
  kernels,
  generation,
  workers,
  resources,
  seedCosts,
  hintReception,
  resourceCycles,
  interactiveBudgetCases,
  interactive: () => profileLiveOperations(compiled),
  dispose() {
    for (const entry of prepared) entry.wasm.free()
    prepared = []
  },
}
