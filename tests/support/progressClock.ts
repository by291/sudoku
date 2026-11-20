import { vi } from 'vitest'

const PROGRESS_DELAY_MILLISECONDS = 350

/** Control progress presentation without replacing IndexedDB's asynchronous task scheduling. */
export function installProgressClock(): void {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
}

/** Advance the presentation delay while keeping request completion under its explicit gate. */
export async function revealDelayedProgress(): Promise<void> {
  await vi.advanceTimersByTimeAsync(PROGRESS_DELAY_MILLISECONDS)
}
