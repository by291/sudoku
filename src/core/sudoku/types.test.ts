import { expect, it } from 'vitest'
import { isCellIndex } from '@/core/sudoku/types'

it.each([
  { value: 0, valid: true },
  { value: 80, valid: true },
  { value: -0, valid: true },
  { value: -1, valid: false },
  { value: 81, valid: false },
  { value: 0.5, valid: false },
  { value: '0', valid: false },
  { value: null, valid: false },
  { value: undefined, valid: false },
  { value: NaN, valid: false },
  { value: Infinity, valid: false },
  { value: 1n, valid: false },
  { value: [], valid: false },
  { value: {}, valid: false },
])('validates a shared board/rule cell index: $value', ({ value, valid }) => {
  expect(isCellIndex(value)).toBe(valid)
})
