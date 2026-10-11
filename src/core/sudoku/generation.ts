import type { Board, Difficulty } from './types'
import { BOARD_SIZE, BOX_SIZE, DIGITS, UNIT_SIZE } from './types'
import { TEMPLATES } from './templates'
import type { PuzzleTemplate } from './templates'
import { countSolutions } from './search'
import { rateDifficulty } from './logic'
import { parseBoard, isComplete } from './board'
import { isDifficulty, isRecord } from './types'
import type { ParseResult } from './types'
export const PUZZLE_VERSION = 'sudoku-v1'
export type Puzzle = {
  givens: Board
  solution: Board
  difficulty: Difficulty
  seed: string
  puzzleVersion: string
}
export type GenerationInput = { seed: string; difficulty: Difficulty; puzzleVersion: string }
export type GenerationLimits = {
  maxLayouts: number
  searchNodes: number
  logicalSteps: number
  fallbackNodes: number
}
export type GenerationResult =
  | { status: 'ready'; puzzle: Puzzle; source: 'generated' | 'fallback' }
  | { status: 'budget-exhausted'; stage: 'fallback-validation' }
  | { status: 'failed'; reason: string }
export function parsePuzzle(value: unknown): ParseResult<Puzzle> {
  if (
    !isRecord(value) ||
    !isDifficulty(value.difficulty) ||
    typeof value.seed !== 'string' ||
    !value.seed ||
    typeof value.puzzleVersion !== 'string' ||
    !value.puzzleVersion
  )
    return { valid: false, issues: ['Invalid puzzle metadata'] }
  const givens = parseBoard(value.givens),
    solution = parseBoard(value.solution)
  if (!givens.valid || !solution.valid) return { valid: false, issues: ['Invalid puzzle board'] }
  if (
    !isComplete(solution.value) ||
    givens.value.some((digit, cell) => digit !== 0 && digit !== solution.value[cell])
  )
    return { valid: false, issues: ['Solution does not satisfy puzzle givens'] }
  return {
    valid: true,
    value: {
      givens: givens.value,
      solution: solution.value,
      difficulty: value.difficulty,
      seed: value.seed,
      puzzleVersion: value.puzzleVersion,
    },
  }
}
export const DEFAULT_GENERATION_LIMITS: GenerationLimits = {
  maxLayouts: 20,
  searchNodes: 1000000,
  logicalSteps: 500,
  fallbackNodes: 1000000,
}
function seededRandom(seed: string): () => number {
  // sudoku-v1 hashes UTF-16 code units using FNV-1a, then uses Mulberry32.
  // Every shuffle consumes this stream; neither wall time nor Math.random participates.
  let state = 2166136261
  for (let index = 0; index < seed.length; index++)
    state = Math.imul(state ^ seed.charCodeAt(index), 16777619) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index--) {
    const partner = Math.floor(random() * (index + 1))
    ;[result[index], result[partner]] = [result[partner], result[index]]
  }
  return result
}
function transform(template: PuzzleTemplate, random: () => number): PuzzleTemplate {
  const digits = shuffle(DIGITS, random)
  function axis() {
    return shuffle([0, 1, 2], random).flatMap((group) =>
      shuffle([0, 1, 2], random).map((offset) => group * BOX_SIZE + offset),
    )
  }
  const rows = axis(),
    columns = axis()
  const transpose = random() < 0.5
  function map(board: Board): Board {
    return Array.from({ length: BOARD_SIZE }, (_, cell) => {
      const row = rows[Math.floor(cell / UNIT_SIZE)],
        column = columns[cell % UNIT_SIZE]
      const value = board[transpose ? column * UNIT_SIZE + row : row * UNIT_SIZE + column]
      return value === 0 ? 0 : digits[value - 1]
    })
  }
  return {
    difficulty: template.difficulty,
    givens: map(template.givens),
    solution: map(template.solution),
  }
}
export function generatePuzzle(
  input: GenerationInput,
  limits = DEFAULT_GENERATION_LIMITS,
): GenerationResult {
  if (input.puzzleVersion !== PUZZLE_VERSION)
    return { status: 'failed', reason: 'Unsupported puzzle version' }
  if (!input.seed || !['easy', 'medium', 'hard'].includes(input.difficulty))
    return { status: 'failed', reason: 'Invalid generation input' }
  const limitKeys: readonly (keyof GenerationLimits)[] = [
    'maxLayouts',
    'searchNodes',
    'logicalSteps',
    'fallbackNodes',
  ]
  for (const key of limitKeys) {
    if (
      !Number.isInteger(limits[key]) ||
      limits[key] < 0 ||
      limits[key] > DEFAULT_GENERATION_LIMITS[key]
    )
      return { status: 'failed', reason: 'Invalid generation budget' }
  }
  const random = seededRandom(`${input.puzzleVersion}:${input.difficulty}:${input.seed}`)
  let nodesRemaining = limits.searchNodes
  const makePuzzle = (template: PuzzleTemplate): Puzzle => ({
    ...template,
    seed: input.seed,
    puzzleVersion: input.puzzleVersion,
  })
  const clueTargets: Record<Difficulty, number> = { easy: 36, medium: 32, hard: 30 }
  for (let layout = 0; layout < limits.maxLayouts && nodesRemaining > 0; layout++) {
    // A symmetry transform constructs a valid complete solution without search nodes.
    const complete = transform(TEMPLATES[0], random).solution
    const givens = [...complete]
    let clues = BOARD_SIZE
    for (const cell of shuffle(
      Array.from({ length: BOARD_SIZE }, (_, index) => index),
      random,
    )) {
      const previous = givens[cell]
      givens[cell] = 0
      const uniqueness = countSolutions(givens, { maxSolutions: 2, nodeBudget: nodesRemaining })
      nodesRemaining -= uniqueness.nodesVisited
      if (uniqueness.status === 'budget-exhausted') {
        givens[cell] = previous
        break
      }
      if (uniqueness.count !== 1) {
        givens[cell] = previous
        continue
      }
      clues--
      if (
        clues <= clueTargets[input.difficulty] &&
        rateDifficulty(givens, limits.logicalSteps) === input.difficulty
      )
        return {
          status: 'ready',
          source: 'generated',
          puzzle: makePuzzle({ givens, solution: complete, difficulty: input.difficulty }),
        }
      if (nodesRemaining === 0) break
    }
  }
  const templates = TEMPLATES.filter((template) => template.difficulty === input.difficulty)
  const fallback = transform(templates[Math.floor(random() * templates.length)], random)
  const verified = countSolutions(fallback.givens, {
    maxSolutions: 2,
    nodeBudget: limits.fallbackNodes,
  })
  if (verified.status === 'budget-exhausted')
    return { status: 'budget-exhausted', stage: 'fallback-validation' }
  if (
    verified.count !== 1 ||
    rateDifficulty(fallback.givens, limits.logicalSteps) !== input.difficulty
  )
    return { status: 'failed', reason: 'Fallback validation failed' }
  return { status: 'ready', source: 'fallback', puzzle: makePuzzle(fallback) }
}
