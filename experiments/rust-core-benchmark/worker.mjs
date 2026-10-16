import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { engine, prepare } from './engine.mjs'

const [corpusPath, group, loops] = process.argv.slice(2)
const iterations = Number(loops)
const cases = JSON.parse(readFileSync(corpusPath, 'utf8'))
  .filter((entry) => entry.benchmark && (group === 'candidates' || entry.variant === group))
  .map((entry) => {
    const computation = prepare(entry.rules)
    return { ...entry, computation, validator: engine.prepareExactValidator(computation) }
  })

function batch() {
  let checksum = 0
  for (const entry of cases) {
    if (group === 'candidates') {
      const masks = engine.calculateBaseCandidates(entry.board, entry.computation.context)
      for (let cell = 0; cell < 81; cell++) {
        checksum += masks[cell] * (cell + 1)
      }
    } else {
      const result = entry.validator.count(
        entry.board,
        engine.createWorkBudget(4_000_000),
        1_000_000,
      )
      if (result.status !== 'complete') {
        throw new Error('Timed corpus unexpectedly exhausted')
      }
      checksum += result.count * 17 + result.nodesVisited * 31 + result.workUsed * 37
      for (let cell = 0; cell < (result.solution?.length ?? 0); cell++) {
        checksum += result.solution[cell] * (cell + 1)
      }
    }
  }
  return checksum
}

// Fresh processes receive time-based warmup; loading, preparation and warmup are not timed.
const warmUntil = performance.now() + 250
while (performance.now() < warmUntil) {
  batch()
}
let checksum = 0
const started = performance.now()
for (let iteration = 0; iteration < iterations; iteration++) {
  checksum += batch()
}
const elapsedMs = performance.now() - started
process.stdout.write(JSON.stringify({ elapsedMs, checksum }) + '\n')
