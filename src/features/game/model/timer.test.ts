import { expect, it } from 'vitest'
import { readElapsed, resumeClock, pauseClock } from '@/features/game/model/timer'

it('counts running intervals and excludes paused time', () => {
  const running = resumeClock({ accumulatedMs: 0, runningSince: null }, 100)

  const paused = pauseClock(running, 1600)
  const resumed = resumeClock(paused, 50000)

  expect(readElapsed(running, 1600)).toBe(1500)
  expect(readElapsed(paused, 50000)).toBe(1500)
  expect(readElapsed(resumed, 50300)).toBe(1800)
})

it('restores a paused accumulated duration and preserves fractional precision', () => {
  const restored = { accumulatedMs: 1234, runningSince: null }

  const paused = pauseClock(resumeClock(restored, 100.2), 101.8)

  expect(readElapsed(restored, 999999)).toBe(1234)
  expect(readElapsed(paused, -100000)).toBeCloseTo(1235.6)
})
