import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { referenceRoot } from './freeze-reference.mjs'
import { loadEngine } from './reference-loader.mjs'
import { deriveSeed } from './v11-random.ts'
import { fixtureRoot } from './suites.mjs'

const engine = await loadEngine({ v11: true })
const { constructGenerationLayout } = await import(
  pathToFileURL(resolve(referenceRoot, 'src/core/sudoku/generation/layouts.ts')).href
)
const { createGenerationRandom } = await import(
  pathToFileURL(resolve(referenceRoot, 'src/core/sudoku/generation/random.ts')).href
)
const authored = JSON.parse(readFileSync(resolve(fixtureRoot, 'assessment.json'), 'utf8'))
const rows = []
for (const row of authored) {
  const seed = deriveSeed(new TextEncoder().encode(`layout:${row.id}`))
  const variant = row.input.rules.kind
  const difficulty = row.input.difficulty
  const request = engine.createGenerationInput(
    variant,
    difficulty,
    Buffer.from(seed).toString('hex'),
  )
  for (const layout of [0, 1]) {
    for (const limit of [0, 1, 9, 50, 100000]) {
      const random = {
        terminal: createGenerationRandom(request, 'terminal', layout),
        geometry: createGenerationRandom(request, 'geometry', layout),
      }
      const budget = engine.createWorkBudget(limit)
      const result = constructGenerationLayout(request, random, budget)
      rows.push({
        id: `${row.id}:${layout}:${limit}`,
        input: {
          seed: [...seed],
          variant,
          difficulty,
          puzzleVersion: request.puzzleVersion,
          layout,
          limit,
        },
        expected: {
          result,
          workUsed: budget.used,
          nextTerminal: random.terminal(),
          nextGeometry: random.geometry(),
        },
      })
    }
  }
}
writeFileSync(resolve(fixtureRoot, 'generation-layouts.json'), JSON.stringify(rows, null, 2) + '\n')
console.log(`Captured ${rows.length} terminal/layout and random-continuation probes`)
