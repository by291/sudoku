import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { appendFileSync, unlinkSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { referenceRoot, sha256, verifyReference } from './freeze-reference.mjs'
import { loadEngine } from './reference-loader.mjs'
import {
  deriveSeed,
  createRandom,
  phaseMaterial,
  phaseSeed,
  VARIANTS,
  DIFFICULTIES,
  PHASES,
} from './v11-random.ts'
import { computeCase, fixtureRoot } from './suites.mjs'

const engine = await loadEngine({ v11: true })
const { RATING_FIXTURES } = await import(
  pathToFileURL(resolve(referenceRoot, 'tests/fixtures/rating.ts')).href
)
const boards = await import(pathToFileURL(resolve(referenceRoot, 'tests/fixtures/sudoku.ts')).href)
const variants = await import(
  pathToFileURL(resolve(referenceRoot, 'tests/fixtures/variants.ts')).href
)
const { referenceCountSolutions } = await import(
  pathToFileURL(resolve(referenceRoot, 'tests/support/referenceVariants.ts')).href
)
const historical = JSON.parse(
  readFileSync(resolve('tests/migration/historical-corpus.json'), 'utf8'),
)
mkdirSync(fixtureRoot, { recursive: true })
const record = (name, data) =>
  writeFileSync(resolve(fixtureRoot, name + '.json'), JSON.stringify(data, null, 2) + '\n')
const selectedFamily = process.argv[2]

if (!selectedFamily || selectedFamily === 'primitives') {
  const inputs = historical.corpora.flatMap((family) =>
    family.cases.map((row, index) => ({
      id: `${family.suite}:${index}`,
      family: family.suite,
      input: {
        ...row.input,
        seed: [...deriveSeed(new TextEncoder().encode(`migration:${family.suite}:${index}`))],
        puzzleVersion: row.input.variant === 'classic' ? 'sudoku-v11' : 'sudoku-variants-v11',
      },
    })),
  )
  assert.equal(inputs.length, 2241)
  record('inputs', inputs)
  const seedCases = [
    new Uint8Array(32),
    Uint8Array.from({ length: 32 }, (_, i) => i),
    new Uint8Array(32).fill(255),
  ]
  const randomCases = []
  for (const [index, seed] of seedCases.entries()) {
    const random = createRandom(seed)
    randomCases.push({
      kind: 'raw',
      seed: [...seed],
      words: Array.from({ length: 80 }, () => random.nextU32()),
    })
    for (const variant of VARIANTS)
      for (const difficulty of DIFFICULTIES) {
        if (variant !== 'classic' && difficulty === 'expert') continue
        for (const phase of PHASES)
          for (const [layout, proposal] of [
            [1, 0],
            [40, 31],
            [0x01020304, 0x05060708],
          ]) {
            const input = {
              seed,
              variant,
              difficulty,
              puzzleVersion: variant === 'classic' ? 'sudoku-v11' : 'sudoku-variants-v11',
            }
            const key = phaseSeed(input, phase, layout, proposal)
            const random = createRandom(key)
            randomCases.push({
              kind: 'phase',
              seed: [...seed],
              variant,
              difficulty,
              phase,
              layout,
              proposal,
              material: [...phaseMaterial(input, phase, layout, proposal)],
              key: [...key],
              words: Array.from({ length: 20 }, () => random.nextU32()),
            })
          }
      }
    console.log(`random vectors ${index + 1}/${seedCases.length}`)
  }
  record('random', randomCases)
  const authored = RATING_FIXTURES.map((f) => ({
    id: f.id,
    board: f.board,
    rules: f.rules,
    solution: f.solution,
    difficulty: f.difficulty,
  }))
  const ruleCases = authored.map((f) => ({ id: f.id, input: { rules: f.rules, board: f.board } }))
  const constraintCases = authored.flatMap((f) =>
    [0, 1, 4000000].map((limit) => ({
      id: `${f.id}:${limit}`,
      input: { board: f.board, rules: f.rules, limit },
    })),
  )
  const exactCases = [
    ...authored,
    ...Object.entries(boards)
      .filter(([, value]) => Array.isArray(value))
      .map(([id, board]) => ({ id, board, rules: { kind: 'classic' } })),
  ].flatMap((f) =>
    [0, 1, 4000000].flatMap((limit) =>
      [0, 1000000].map((nodes) => ({
        id: `${f.id}:${limit}:${nodes}`,
        input: { board: f.board, rules: f.rules, limit, nodes },
      })),
    ),
  )
  const fixtureCases = authored.map((f) => ({
    id: f.id,
    input: {
      board: f.board,
      solution: f.solution,
      rules: f.rules,
      difficulty: f.difficulty,
      limit: 4000000,
    },
  }))
  const editingCases = authored.flatMap((f) => {
    const cell = f.board.findIndex((digit) => digit === 0)
    const digit = f.solution[cell]
    const puzzle = {
      givens: f.board,
      solution: f.solution,
      rules: f.rules,
      difficulty: f.difficulty,
      seed: 'historical',
      puzzleVersion: 'old',
    }
    return ['enter', 'erase', 'toggle-note', 'generate-notes'].map((kind) => ({
      id: `${f.id}:${kind}`,
      input: {
        puzzle,
        action: kind === 'generate-notes' ? { kind } : { kind, cell, digit },
        limit: 4000000,
      },
    }))
  })
  for (const [suite, cases] of Object.entries({
    rules: ruleCases,
    constraints: constraintCases,
    exact: exactCases,
    logic: fixtureCases,
    hints: fixtureCases,
    assessment: fixtureCases,
    editing: editingCases,
    validation: authored.flatMap((f) =>
      [false, true].map((invalid) => ({
        id: `${f.id}:${invalid}`,
        input: {
          puzzle: {
            givens: f.board,
            solution: invalid ? Array(81).fill(1) : f.solution,
            rules: f.rules,
            difficulty: f.difficulty,
            seed: 'historical',
            puzzleVersion: 'old',
          },
        },
      })),
    ),
  })) {
    record(
      suite,
      await Promise.all(
        cases.map(async (row) => ({
          ...row,
          expected: await computeCase(engine, suite, row.input),
        })),
      ),
    )
    console.log(`${suite}: ${cases.length} fixtures`)
  }
  record('geometry', variants.VARIANT_FIXTURES)
  const patches = ['reference-loader.mjs', 'v11-random.ts'].map((file) => ({
    file,
    sha256: sha256(readFileSync(new URL(file, import.meta.url))),
  }))
  record('manifest', {
    reference: verifyReference(),
    patch: patches,
    dependencies: { '@noble/hashes': '2.4.0', '@noble/ciphers': '2.4.0' },
    historicalInputs: historical.historicalCorpus,
    corpusCases: 2241,
    primitiveSources: [
      'https://github.com/BLAKE3-team/BLAKE3/blob/master/test_vectors/test_vectors.json',
      'https://datatracker.ietf.org/doc/html/draft-strombergson-chacha-test-vectors-01',
    ],
  })
}

if (selectedFamily && selectedFamily !== 'primitives') {
  const rows = JSON.parse(readFileSync(resolve(fixtureRoot, 'inputs.json'), 'utf8')).filter(
    (row) => row.family === selectedFamily,
  )
  assert.ok(rows.length > 0)
  const target = resolve(fixtureRoot, `generation-v11-${selectedFamily}.jsonl`)
  writeFileSync(target, '')
  for (const [index, row] of rows.entries()) {
    const expected = await computeCase(engine, 'generation', row.input)
    const result = expected.result
    if (result.status === 'ready') {
      const counted = referenceCountSolutions(result.puzzle.givens, result.puzzle.rules)
      assert.equal(counted.count, 1, row.id)
      assert.deepEqual(counted.solution, result.puzzle.solution, row.id)
      assert.equal(expected.assessment.result.status, 'rated', row.id)
      assert.equal(expected.assessment.result.summary.difficulty, row.input.difficulty, row.id)
    }
    appendFileSync(target, JSON.stringify({ id: row.id, input: row.input, expected }) + '\n')
    if ((index + 1) % 16 === 0 || index + 1 === rows.length)
      console.log(`${selectedFamily}: ${index + 1}/${rows.length}`)
  }
  writeFileSync(target + '.gz', gzipSync(readFileSync(target), { level: 9 }))
  unlinkSync(target)
}
