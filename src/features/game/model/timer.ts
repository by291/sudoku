export type RunClock = { accumulatedMs: number; runningSince: number | null }

/** Read elapsed milliseconds against the same monotonic clock used to resume. */
export function readElapsed(clock: RunClock, now: number): number {
  return (
    clock.accumulatedMs + (clock.runningSince === null ? 0 : Math.max(0, now - clock.runningSince))
  )
}

/** Start a new running interval while preserving any existing interval. */
export function resumeClock(clock: RunClock, now: number): RunClock {
  return clock.runningSince === null ? { ...clock, runningSince: now } : clock
}

/** Settle the running interval and preserve its accumulated duration. */
export function pauseClock(clock: RunClock, now: number): RunClock {
  return { accumulatedMs: readElapsed(clock, now), runningSince: null }
}
