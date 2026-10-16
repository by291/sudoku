import type { GameSession } from '@/features/game/model/session'
import { createGenerationInput } from '@/sudoku/generationInput'
import type { GenerationInput } from '@/sudoku/generationInput'
import type { SudokuVariant } from '@/core/sudoku/rules/types'
import { SUDOKU_VARIANTS } from '@/core/sudoku/rules/types'

export function isChallengeDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  )
}

const beijingCalendar = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function getChallengeDate(now: Date): string {
  const parts = beijingCalendar.formatToParts(now)
  const date = ['year', 'month', 'day']
    .map((kind) => parts.find((part) => part.type === kind)?.value)
    .join('-')
  if (!isChallengeDate(date)) {
    throw new TypeError('Invalid challenge date')
  }

  return date
}

/** ASCII material only; the ready Rust engine derives the binary root seed. */
export function getDailySeedMaterial(date: string): Uint8Array {
  if (!isChallengeDate(date)) {
    throw new TypeError('Invalid challenge date')
  }
  return Uint8Array.from(`daily:${date}`, (character) => character.charCodeAt(0))
}

export function getDailyFormalId(date: string, variant: SudokuVariant): string {
  if (!isChallengeDate(date)) {
    throw new TypeError('Invalid challenge date')
  }
  return variant === 'classic' ? `daily:${date}:formal` : `daily:${variant}:${date}:formal`
}

export function getDailyIdentity(
  date: string,
  variant: SudokuVariant,
  seed: Uint8Array,
): { seed: Uint8Array; formalId: string; input: GenerationInput } {
  const formalId = getDailyFormalId(date, variant)
  const input = createGenerationInput(variant, 'medium', seed)
  return { formalId, input, seed: input.seed.slice() }
}

export function restartDailySession(session: GameSession): GameSession {
  if (session.mode !== 'daily') {
    throw new TypeError('Only daily sessions retain their accumulated time')
  }

  if (session.completion) {
    return session
  }

  return {
    ...session,
    entries: Array(81).fill(0),
    notes: Array(81).fill(0),
    undoStack: [],
    redoStack: [],
  }
}

export type DailyVariantStatus = {
  variant: SudokuVariant
  state: 'available' | 'in-progress' | 'completed'
}

export function getDailyStatuses(
  sessions: readonly { session: GameSession }[],
  results: readonly { session: GameSession }[],
  date: string,
): readonly DailyVariantStatus[] {
  return SUDOKU_VARIANTS.map((variant) => {
    const formalId = getDailyFormalId(date, variant)
    const saved = sessions.find((record) => record.session.id === formalId)?.session
    const completed =
      saved?.completion ||
      results.some((record) => record.session.id === formalId && record.session.completion)

    if (completed) {
      return { variant, state: 'completed' }
    }

    return { variant, state: saved ? 'in-progress' : 'available' }
  })
}
