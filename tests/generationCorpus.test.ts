// @vitest-environment node
import { afterAll, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { cpus, platform, release } from 'node:os'
import { createGenerationInput, DEFAULT_GENERATION_LIMITS } from '@/core/sudoku/generation/input'
import { generatePuzzle } from '@/core/sudoku/generation/generate'
import { PUZZLE_VERSION, VARIANT_PUZZLE_VERSION } from '@/core/sudoku/generation/types'
import { RATING_VERSION } from '@/core/sudoku/rating/policies'
import { assessPuzzle } from '@/core/sudoku/rating/assessment'
import { createAssessmentInput } from '@/core/sudoku/rating/input'
import {
  CORPUS_COMBINATIONS,
  CORPUS_SEEDS,
  REGRESSION_SEEDS,
  CORPUS_VERSION,
} from './fixtures/generationCorpus'
import { referenceCountSolutions } from './support/referenceVariants'
import { countIntercalates } from './support/terminalDiversity'
import { geometrySignature } from './support/geometryDiversity'
import { structureIssues } from './support/variantStructure'
import { countReferenceSolutions } from './support/referenceSudoku'

const phase = process.env.SUDOKU_CORPUS_PHASE
const seeds = phase ? CORPUS_SEEDS : REGRESSION_SEEDS
const rows: Record<string, unknown>[] = []

it.each(CORPUS_COMBINATIONS)(
  'verifies the fixed $variant/$difficulty corpus',
  ({ variant, difficulty }) => {
    let generated = 0
    for (const seed of seeds) {
      const input = createGenerationInput(variant, difficulty, seed)
      const start = performance.now()
      const result = generatePuzzle(input)
      const milliseconds = performance.now() - start
      expect(result.metrics.constructionWork).toBeLessThanOrEqual(DEFAULT_GENERATION_LIMITS.maxWork)
      expect(result.metrics.layouts).toBeLessThanOrEqual(DEFAULT_GENERATION_LIMITS.maxLayouts)
      if (result.status !== 'ready') {
        expect(result, `${variant}/${difficulty}/${seed}`).toMatchObject({
          status: 'budget-exhausted',
          stage: 'construction',
        })
        expect(result).not.toHaveProperty('puzzle')
        expect(result).not.toHaveProperty('assessment')
        if (!phase) {
          expect(generatePuzzle(input)).toEqual(result)
        }
        rows.push({ variant, difficulty, seed, status: result.status, result, milliseconds })
        continue
      }
      generated++
      expect(result.source).toBe('generated')
      const { puzzle } = result
      expect(structureIssues(puzzle.solution, puzzle.rules)).toEqual([])
      const independent = referenceCountSolutions(puzzle.givens, puzzle.rules)
      expect(independent).toEqual({ count: 1, solution: puzzle.solution })
      if (
        variant !== 'classic' &&
        structureIssues(puzzle.solution, { kind: 'classic' }).length === 0
      ) {
        expect(countReferenceSolutions(puzzle.givens, 2), 'Independent variant necessity').not.toBe(
          1,
        )
      }
      const rating = assessPuzzle(createAssessmentInput(puzzle.givens, puzzle.rules))
      expect(rating).toMatchObject({ status: 'rated', summary: result.assessment })
      if (rating.status !== 'rated') {
        throw new Error('Missing complete corpus assessment')
      }
      for (const step of rating.trace) {
        if (step.kind === 'placement') {
          expect(step.digit, 'Independent known-solution placement').toBe(
            puzzle.solution[step.cell],
          )
        } else {
          for (const removal of step.removals) {
            expect(
              removal.digit,
              'Elimination must retain the independently unique solution',
            ).not.toBe(puzzle.solution[removal.cell])
          }
        }
      }
      expect(result.assessment.difficulty).toBe(difficulty)
      if (!phase) {
        expect(generatePuzzle(input)).toEqual(result)
      }
      rows.push({
        variant,
        difficulty,
        seed,
        status: 'ready',
        source: result.source,
        metrics: result.metrics,
        workload: result.assessment.workload,
        terminalInvariant: countIntercalates(puzzle.solution),
        geometry: geometrySignature(puzzle.rules),
        independentUnique: true,
        independentStructure: true,
        independentNecessity: variant !== 'classic',
        independentTrace: true,
        milliseconds,
      })
    }
    expect(generated, `Fresh generation for ${variant}/${difficulty}`).toBeGreaterThan(0)
    if (phase) {
      console.info(`${phase}: verified ${variant}/${difficulty} (${seeds.length} seeds)`)
    }
  },
  300000,
)

afterAll(() => {
  if (!phase) {
    return
  }
  const report = {
    corpusVersion: CORPUS_VERSION,
    phase,
    seeds: CORPUS_SEEDS,
    combinations: CORPUS_COMBINATIONS,
    requests: rows.length,
    versions: {
      classic: PUZZLE_VERSION,
      variants: VARIANT_PUZZLE_VERSION,
      assessment: RATING_VERSION,
    },
    limits: DEFAULT_GENERATION_LIMITS,
    host: {
      platform: platform(),
      release: release(),
      node: process.version,
      cpu: cpus()[0]?.model ?? 'unavailable',
    },
    rows,
  }
  writeFileSync(
    `${process.env.SUDOKU_CORPUS_OUTPUT ?? '.superpowers/sdd/2026-10-14-sudoku-local-product-roadmap'}/corpus-${phase}.json`,
    JSON.stringify(report, null, 2),
  )
  if (phase === 'current') {
    for (const variant of ['diagonal', 'jigsaw', 'killer', 'thermo', 'arrow']) {
      const accepted = rows.filter((row) => row.variant === variant && row.status === 'ready')
      expect(
        new Set(accepted.map((row) => row.terminalInvariant)).size,
        `${variant} terminal families`,
      ).toBeGreaterThanOrEqual(4)
      if (variant !== 'diagonal') {
        expect(
          new Set(accepted.map((row) => row.geometry)).size,
          `${variant} geometry families`,
        ).toBeGreaterThan(1)
      }
    }
  }
})
