import type { Unit, SudokuVariant } from '@/core/sudoku/rules'
import type { Difficulty, Digit } from '@/core/sudoku/types'

type Domains = readonly (readonly [number, readonly Digit[]])[]
type UnitWitness = {
  unit: Unit
  cells: readonly number[]
  digits: readonly Digit[]
  domains: Domains
  removals: readonly { cell: number; digit: Digit }[]
} & ({ technique: 'locked-candidate'; target: Unit } | { technique: 'naked-pair' | 'hidden-pair' })
type RatingWitness = UnitWitness | { technique: 'arrow-combination'; domains: Domains }
type HigherTierFixtureId = `${SudokuVariant}-${Exclude<Difficulty, 'easy'>}`

// Fixed facts from authored boards: locked positions share a region; pairs reserve two digits.
// The tests independently replay candidate lists and prove each implication from these facts.
export const RATING_WITNESSES: Readonly<Record<string, RatingWitness>> = {
  'classic-medium': {
    technique: 'locked-candidate',
    unit: { kind: 'row', index: 0 },
    target: { kind: 'box', index: 0 },
    cells: [0, 2],
    digits: [4],
    domains: [
      [0, [4, 5]],
      [2, [4, 5]],
      [9, [4, 6, 7]],
      [11, [2, 4, 6]],
    ],
    removals: [
      { cell: 9, digit: 4 },
      { cell: 11, digit: 4 },
    ],
  },
  'classic-hard': {
    technique: 'naked-pair',
    unit: { kind: 'row', index: 3 },
    cells: [33, 34],
    digits: [2, 4],
    domains: [
      [33, [2, 4]],
      [34, [2, 4]],
      [28, [2, 4, 5]],
      [31, [3, 4, 5, 6]],
      [35, [3, 4, 6]],
    ],
    removals: [
      { cell: 28, digit: 2 },
      { cell: 28, digit: 4 },
      { cell: 31, digit: 4 },
      { cell: 35, digit: 4 },
    ],
  },
  'diagonal-medium': {
    technique: 'locked-candidate',
    unit: { kind: 'row', index: 0 },
    target: { kind: 'box', index: 2 },
    cells: [6, 8],
    digits: [7],
    domains: [
      [6, [7, 9]],
      [8, [6, 7, 9]],
      [25, [1, 5, 6, 7, 9]],
      [26, [1, 6, 7, 9]],
    ],
    removals: [
      { cell: 25, digit: 7 },
      { cell: 26, digit: 7 },
    ],
  },
  'diagonal-hard': {
    technique: 'naked-pair',
    unit: { kind: 'row', index: 4 },
    cells: [40, 42],
    digits: [2, 3],
    domains: [
      [40, [2, 3]],
      [42, [2, 3]],
      [36, [3, 6, 9]],
      [38, [3, 4, 6, 7, 9]],
      [43, [2, 3, 9]],
      [44, [2, 4, 7]],
    ],
    removals: [
      { cell: 36, digit: 3 },
      { cell: 38, digit: 3 },
      { cell: 43, digit: 2 },
      { cell: 43, digit: 3 },
      { cell: 44, digit: 2 },
    ],
  },
  'jigsaw-medium': {
    technique: 'locked-candidate',
    unit: { kind: 'row', index: 4 },
    target: { kind: 'region', index: 4 },
    cells: [39, 41],
    digits: [9],
    domains: [
      [39, [1, 5, 6, 9]],
      [41, [5, 6, 9]],
      [31, [5, 9]],
      [32, [5, 6, 9]],
    ],
    removals: [
      { cell: 31, digit: 9 },
      { cell: 32, digit: 9 },
    ],
  },
  'jigsaw-hard': {
    technique: 'hidden-pair',
    unit: { kind: 'row', index: 6 },
    cells: [54, 58],
    digits: [3, 6],
    domains: [
      [54, [1, 3, 6]],
      [58, [3, 6, 7, 8, 9]],
    ],
    removals: [
      { cell: 54, digit: 1 },
      { cell: 58, digit: 7 },
      { cell: 58, digit: 8 },
      { cell: 58, digit: 9 },
    ],
  },
  'killer-medium': {
    technique: 'locked-candidate',
    unit: { kind: 'column', index: 1 },
    target: { kind: 'box', index: 3 },
    cells: [28, 37],
    digits: [3],
    domains: [
      [28, [1, 3, 9]],
      [37, [1, 3, 6]],
      [27, [1, 2, 3, 5]],
      [36, [1, 2, 3, 5, 6]],
      [38, [1, 2, 3, 5, 7]],
    ],
    removals: [
      { cell: 27, digit: 3 },
      { cell: 36, digit: 3 },
      { cell: 38, digit: 3 },
    ],
  },
  'killer-hard': {
    technique: 'naked-pair',
    unit: { kind: 'row', index: 3 },
    cells: [30, 31],
    digits: [5, 6],
    domains: [
      [30, [5, 6]],
      [31, [5, 6]],
      [28, [3, 6]],
      [33, [6, 8]],
      [34, [3, 4, 6, 8, 9]],
      [35, [1, 4, 6, 9]],
    ],
    removals: [
      { cell: 28, digit: 6 },
      { cell: 33, digit: 6 },
      { cell: 34, digit: 6 },
      { cell: 35, digit: 6 },
    ],
  },
  'thermo-medium': {
    technique: 'locked-candidate',
    unit: { kind: 'row', index: 2 },
    target: { kind: 'box', index: 1 },
    cells: [21, 23],
    digits: [1],
    domains: [
      [21, [1, 8]],
      [23, [1, 3, 8]],
      [13, [1, 8, 9]],
      [14, [1, 3, 8, 9]],
    ],
    removals: [
      { cell: 13, digit: 1 },
      { cell: 14, digit: 1 },
    ],
  },
  'thermo-hard': {
    technique: 'hidden-pair',
    unit: { kind: 'row', index: 7 },
    cells: [68, 69],
    digits: [2, 3],
    domains: [
      [68, [2, 3, 4]],
      [69, [2, 3, 4, 6]],
    ],
    removals: [
      { cell: 68, digit: 4 },
      { cell: 69, digit: 4 },
      { cell: 69, digit: 6 },
    ],
  },
  'arrow-medium': {
    technique: 'arrow-combination',
    domains: [
      [8, [8]],
      [16, [2]],
      [24, [1, 5, 7, 9]],
      [32, [3]],
      [40, [2, 4]],
    ],
  },
  'arrow-hard': {
    technique: 'naked-pair',
    unit: { kind: 'column', index: 7 },
    cells: [43, 70],
    digits: [3, 5],
    domains: [
      [43, [3, 5]],
      [70, [3, 5]],
      [25, [5, 6, 7, 9]],
      [34, [3, 9]],
    ],
    removals: [
      { cell: 25, digit: 5 },
      { cell: 34, digit: 3 },
    ],
  },
} satisfies Record<HigherTierFixtureId, RatingWitness>
