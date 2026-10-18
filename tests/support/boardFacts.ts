import type { Digit, Unit } from '@/sudoku/contracts'

const digits: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export const maskOf = (digit: Digit): number => 1 << (digit - 1)
export const digitsIn = (mask: number): readonly Digit[] =>
  digits.filter((digit) => (mask & maskOf(digit)) !== 0)

// Literal Sudoku geometry for checking authored lesson evidence independently of the engine.
export const UNITS: readonly (Unit & { cells: readonly number[] })[] = Array.from(
  { length: 9 },
  (_, index) => [
    {
      kind: 'row' as const,
      index,
      cells: Array.from({ length: 9 }, (_, column) => index * 9 + column),
    },
    {
      kind: 'column' as const,
      index,
      cells: Array.from({ length: 9 }, (_, row) => row * 9 + index),
    },
    {
      kind: 'box' as const,
      index,
      cells: Array.from(
        { length: 9 },
        (_, offset) =>
          Math.floor(index / 3) * 27 + (index % 3) * 3 + Math.floor(offset / 3) * 9 + (offset % 3),
      ),
    },
  ],
).flat()
