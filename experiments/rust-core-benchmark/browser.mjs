import { calculateBaseCandidates } from '@/core/sudoku/board'
import { createWorkBudget } from '@/core/sudoku/budget'
import { prepareRuleComputation } from '@/core/sudoku/constraints/computation'
import { prepareExactValidator } from '@/core/sudoku/search/exact'
import init, { WasmBenchmark } from '/wasm/sudoku_core_benchmark.js'

const groups = ['candidates', 'classic', 'diagonal', 'jigsaw', 'killer', 'thermo', 'arrow']
const now = () => globalThis.performance.now()

function assertEqual(actual, expected, description) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${description}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`)
  }
}

function decodeResult(output) {
  const nodesVisited = output[2]
  const workUsed = output[3]
  return output[0] === 1
    ? { status: 'budget-exhausted', nodesVisited, workUsed }
    : {
        status: 'complete',
        count: output[1],
        solution: output.length === 4 ? null : Array.from(output.slice(4)),
        nodesVisited,
        workUsed,
      }
}

globalThis.runBenchmark = async function runBenchmark(group) {
  const groupIndex = groups.indexOf(group)
  if (groupIndex < 0) {
    throw new Error('Unknown benchmark group')
  }

  // A fresh document supplies cold compilation/startup observations, outside steady-state timing.
  const loadStarted = now()
  await init()
  const loadMs = now() - loadStarted
  const corpusText = await (await globalThis.fetch('/corpus.json')).text()
  const cases = JSON.parse(corpusText)
  const preparedStarted = now()
  const wasm = new WasmBenchmark(corpusText)
  const wasmPreparationMs = now() - preparedStarted
  const typescriptStarted = now()
  const entries = cases.map((entry, index) => {
    const prepared = prepareRuleComputation(entry.rules, createWorkBudget(4_000_000))
    if (prepared.status !== 'ready') {
      throw new Error('Fixture preparation exhausted')
    }
    return {
      ...entry,
      index,
      bytes: Uint8Array.from(entry.board),
      computation: prepared.computation,
      validator: prepareExactValidator(prepared.computation),
    }
  })
  const typescriptPreparationMs = now() - typescriptStarted

  try {
    let probes = 0
    for (const entry of entries) {
      assertEqual(
        Array.from(wasm.candidates(entry.index, entry.bytes)),
        entry.expectedCandidates,
        `${entry.id} WASM candidates`,
      )
      assertEqual(
        calculateBaseCandidates(entry.board, entry.computation.context),
        entry.expectedCandidates,
        `${entry.id} browser candidates`,
      )
      for (const probe of entry.probes) {
        const budget = createWorkBudget(probe.workLimit)
        budget.used = probe.initialWork
        assertEqual(
          entry.validator.count(entry.board, budget, probe.nodeLimit),
          probe.expected,
          `${entry.id} browser exact`,
        )
        assertEqual(
          decodeResult(
            wasm.solve(
              entry.index,
              entry.bytes,
              probe.nodeLimit,
              probe.workLimit,
              probe.initialWork,
            ),
          ),
          probe.expected,
          `${entry.id} WASM exact`,
        )
        probes++
      }
    }

    const selected = entries.filter(
      (entry) => entry.benchmark && (groupIndex === 0 || entry.variant === group),
    )
    function typescriptBatch() {
      let checksum = 0
      for (const entry of selected) {
        if (groupIndex === 0) {
          const masks = calculateBaseCandidates(entry.board, entry.computation.context)
          for (let cell = 0; cell < masks.length; cell++) {
            checksum += masks[cell] * (cell + 1)
          }
        } else {
          const result = entry.validator.count(entry.board, createWorkBudget(4_000_000), 1_000_000)
          if (result.status !== 'complete') {
            throw new Error('Timed TypeScript corpus exhausted')
          }
          checksum += result.count * 17 + result.nodesVisited * 31 + result.workUsed * 37
          for (let cell = 0; cell < (result.solution?.length ?? 0); cell++) {
            checksum += result.solution[cell] * (cell + 1)
          }
        }
      }
      return checksum
    }

    function boundaryBatch() {
      let checksum = 0
      for (const entry of selected) {
        if (groupIndex === 0) {
          const masks = wasm.candidates(entry.index, entry.bytes)
          for (let cell = 0; cell < masks.length; cell++) {
            checksum += masks[cell] * (cell + 1)
          }
        } else {
          const output = wasm.solve(entry.index, entry.bytes, 1_000_000, 4_000_000, 0)
          if (output[0] !== 0) {
            throw new Error('Timed WASM corpus exhausted')
          }
          checksum += output[1] * 17 + output[2] * 31 + output[3] * 37
          for (let offset = 4; offset < output.length; offset++) {
            checksum += output[offset] * (offset - 3)
          }
        }
      }
      return checksum
    }

    const operations = {
      typescript: typescriptBatch,
      wasmBatch: () => wasm.batch(groupIndex, 1),
      wasmBoundary: boundaryBatch,
    }
    function measure(language, iterations) {
      const operation = operations[language]
      const warmUntil = now() + 250
      while (now() < warmUntil) {
        operation()
      }
      let checksum = 0
      const started = now()
      if (language === 'wasmBatch') {
        checksum = wasm.batch(groupIndex, iterations)
      } else {
        for (let loop = 0; loop < iterations; loop++) {
          checksum += operation()
        }
      }
      return { elapsedMs: now() - started, checksum }
    }

    const pilot = measure('typescript', 1)
    const iterations = Math.max(1, Math.ceil(180 / Math.max(0.1, pilot.elapsedMs)))
    const samples = { typescript: [], wasmBatch: [], wasmBoundary: [] }
    const checksums = { typescript: [], wasmBatch: [], wasmBoundary: [] }
    const languages = Object.keys(samples)
    for (let round = 0; round < 7; round++) {
      // Rotate the starting language so temperature/order does not consistently favor one runtime.
      const order = [
        ...languages.slice(round % languages.length),
        ...languages.slice(0, round % languages.length),
      ]
      for (const language of order) {
        const result = measure(language, iterations)
        samples[language].push(result.elapsedMs)
        checksums[language].push(result.checksum)
      }
      assertEqual(
        checksums.typescript[round],
        checksums.wasmBatch[round],
        `${group} resident checksum`,
      )
      assertEqual(
        checksums.typescript[round],
        checksums.wasmBoundary[round],
        `${group} boundary checksum`,
      )
    }

    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
    const timings = Object.fromEntries(
      languages.map((language) => [
        language,
        (median(samples[language]) * 1000) / iterations / selected.length,
      ]),
    )
    return {
      group,
      boards: entries.length,
      probes,
      count: selected.length,
      iterations,
      samples,
      checksums,
      timings,
      loadMs,
      wasmPreparationMs,
      typescriptPreparationMs,
    }
  } finally {
    wasm.free()
  }
}
