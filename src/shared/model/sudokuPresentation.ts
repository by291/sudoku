import type { Digit } from '@/sudoku/contracts'
import { DIGITS } from '@/sudoku/values'

/** Display-only mask formatting; deductions and editable note changes are computed in Rust. */
export function digitsIn(mask: number): Digit[] {
  return DIGITS.filter((digit) => (mask & maskOf(digit)) !== 0)
}

export function maskOf(digit: Digit): number {
  return 1 << (digit - 1)
}
