import type { Digit } from '@/sudoku/contracts'
import { DIGITS } from '@/sudoku/values'

/** Display-only mask formatting; deductions and editable note changes are computed in Rust. */
export function digitsIn(mask: number): Digit[] {
  return DIGITS.filter((digit) => (mask & maskOf(digit)) !== 0)
}

/** Return the display bit corresponding to a checked digit. */
export function maskOf(digit: Digit): number {
  return 1 << (digit - 1)
}
