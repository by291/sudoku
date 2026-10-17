import { effectScope, ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { useDelayedProgress } from '@/shared/composables/useDelayedProgress'

afterEach(() => vi.useRealTimers())

it('only reveals continuous pending work after 350 ms and clears immediately on completion', () => {
  vi.useFakeTimers()
  const pending = ref(false)
  const scope = effectScope()
  const visible = scope.run(() => useDelayedProgress(pending))

  pending.value = true
  vi.advanceTimersByTime(349)
  expect(visible?.value).toBe(false)
  vi.advanceTimersByTime(1)
  expect(visible?.value).toBe(true)

  pending.value = false
  expect(visible?.value).toBe(false)
  scope.stop()
})

it('gives each operation a fresh delay and cancels feedback when its owner is disposed', () => {
  vi.useFakeTimers()
  const pending = ref(true)
  const scope = effectScope()
  const visible = scope.run(() => useDelayedProgress(() => pending.value))

  vi.advanceTimersByTime(300)
  pending.value = false
  pending.value = true
  vi.advanceTimersByTime(300)
  expect(visible?.value).toBe(false)

  scope.stop()
  vi.advanceTimersByTime(100)
  expect(visible?.value).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})
