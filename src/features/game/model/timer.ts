export type RunClock = { accumulatedMs: number; runningSince: number | null }

export function readElapsed(clock: RunClock, now: number): number {
  return (
    clock.accumulatedMs + (clock.runningSince === null ? 0 : Math.max(0, now - clock.runningSince))
  )
}

export function resumeClock(clock: RunClock, now: number): RunClock {
  return clock.runningSince === null ? { ...clock, runningSince: now } : clock
}

export function pauseClock(clock: RunClock, now: number): RunClock {
  return { accumulatedMs: readElapsed(clock, now), runningSince: null }
}
