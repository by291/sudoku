import { expect, it } from 'vitest'
import { readElapsed, resumeClock, pauseClock } from './timer'
it('counts running intervals and excludes paused time', () => {
  const running = resumeClock({ accumulatedMs: 0, runningSince: null }, 100)
  expect(readElapsed(running, 1600)).toBe(1500)
  const paused = pauseClock(running, 1600)
  expect(readElapsed(paused, 50000)).toBe(1500)
  expect(readElapsed(resumeClock(paused, 50000), 50300)).toBe(1800)
})
it('restores a paused accumulated duration and preserves fractional precision', () => {
  const restored = { accumulatedMs: 1234, runningSince: null }
  expect(readElapsed(restored, 999999)).toBe(1234)
  const paused = pauseClock(resumeClock(restored, 100.2), 101.8)
  expect(readElapsed(paused, -100000)).toBeCloseTo(1235.6)
})
