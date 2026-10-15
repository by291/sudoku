import { expect, it } from 'vitest'
import { createGenerationRandom } from '@/core/sudoku/random'
import { createGenerationInput } from '@/core/sudoku/generation'

it('isolates terminal and geometry streams from failed candidate exploration', () => {
  const input = createGenerationInput('classic', 'hard', 'feedback-random')
  const terminal = createGenerationRandom(input, 'terminal', 1)
  const candidates = createGenerationRandom(input, 'candidate', 0, 1)
  const before = createGenerationRandom(input, 'geometry', 1)()
  for (let index = 0; index < 1000; index++) {
    candidates()
  }

  expect([terminal(), terminal(), terminal()]).toEqual([
    0.4646321760956198, 0.8685694069135934, 0.28055159538052976,
  ])
  expect(createGenerationRandom(input, 'geometry', 1)()).toBe(before)
  expect(createGenerationRandom(input, 'terminal', 1)()).toBe(
    createGenerationRandom(input, 'terminal', 1)(),
  )
})
